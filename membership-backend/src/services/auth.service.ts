import { db } from '../config/db.js';
import { generateReferralCode } from '../utils/referral.js';
import { sendVerificationEmail } from './email.service.js';
import {
  generateVerificationCode,
  hashVerificationCode,
} from '../utils/verification.js';
import { normalizeNZPhone } from '../utils/phone.js';
import {
  checkOtpRateLimit,
  logOtpEmail,
} from './otp-rate-limit.service.js';
import jwt from 'jsonwebtoken';

interface RegisterInput {
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  referralCode?: string;
  marketingEmailOptIn?: boolean;
  ipAddress?: string | null;
}

export async function registerUser(input: RegisterInput) {
  const connection = await db.getConnection();

  let userId: number;
  let email: string;
  let referralCode: string;
  let verificationCode: string;

  try {
    await connection.beginTransaction();

    email = input.email.trim().toLowerCase();
    await checkOtpRateLimit({
      email,
      ipAddress: input.ipAddress,
    });
    const phone = normalizeNZPhone(input.phone);

    const marketingEmailOptIn =
      input.marketingEmailOptIn === true;

    const [existingEmail]: any = await connection.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    if (existingEmail.length > 0) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }

    const [existingPhone]: any = await connection.query(
      `
      SELECT id
      FROM users
      WHERE phone = ?
      LIMIT 1
      `,
      [phone]
    );

    if (existingPhone.length > 0) {
      throw new Error('PHONE_ALREADY_REGISTERED');
    }

    let referrerUserId: number | null = null;

    if (input.referralCode) {
      const [referrers]: any = await connection.query(
        `
        SELECT id
        FROM users
        WHERE referral_code = ?
          AND status = 'ACTIVE'
        LIMIT 1
        `,
        [input.referralCode.trim().toUpperCase()]
      );

      if (referrers.length === 0) {
        throw new Error('INVALID_REFERRAL_CODE');
      }

      referrerUserId = referrers[0].id;
    }

    referralCode = '';
    let codeExists = true;

    while (codeExists) {
      referralCode = generateReferralCode();

      const [rows]: any = await connection.query(
        `
        SELECT id
        FROM users
        WHERE referral_code = ?
        LIMIT 1
        `,
        [referralCode]
      );

      codeExists = rows.length > 0;
    }

    const [userResult]: any = await connection.query(
      `
      INSERT INTO users (
        email,
        phone,
        first_name,
        last_name,
        referral_code,
        referred_by_user_id,
        marketing_email_opt_in,
        marketing_email_opt_in_at,
        available_points,
        status
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 0,
        'PENDING_EMAIL_VERIFICATION'
      )
      `,
      [
        email,
        phone,
        input.firstName?.trim() || null,
        input.lastName?.trim() || null,
        referralCode,
        referrerUserId,
        marketingEmailOptIn,
        marketingEmailOptIn ? new Date() : null,
      ]
    );

    userId = userResult.insertId;

    if (referrerUserId) {
      await connection.query(
        `
        INSERT INTO referrals (
          referrer_user_id,
          referred_user_id,
          status,
          registered_at
        )
        VALUES (?, ?, 'REGISTERED', NOW())
        `,
        [referrerUserId, userId]
      );
    }

    verificationCode = generateVerificationCode();
    const codeHash =
      hashVerificationCode(verificationCode);

    await connection.query(
      `
      INSERT INTO email_verifications (
        user_id,
        code_hash,
        expires_at
      )
      VALUES (
        ?,
        ?,
        DATE_ADD(NOW(), INTERVAL 10 MINUTE)
      )
      `,
      [userId, codeHash]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
  await sendVerificationEmail(
    email!,
    verificationCode!
  );

  await logOtpEmail({
    email: email!,
    ipAddress: input.ipAddress,
    status: 'SENT',
  });
} catch (error) {
  console.error(
    'User created but verification email failed:',
    error
  );

  await logOtpEmail({
    email: email!,
    ipAddress: input.ipAddress,
    status: 'FAILED',
  });

  throw new Error(
    'VERIFICATION_EMAIL_SEND_FAILED'
  );
}

  return {
    userId: userId!,
    email: email!,
    referralCode: referralCode!,
  };
}

export async function verifyEmail(email: string, code: string) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const normalizedEmail = email.trim().toLowerCase();

    // 1. 找用户
    const [users]: any = await connection.query(
      `
      SELECT
          id,
          email,
          first_name AS firstName,
          last_name AS lastName,
          status
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [normalizedEmail]
    );
    if (users.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = users[0];

    // 已经验证过
    if (user.status === 'ACTIVE') {
      throw new Error('EMAIL_ALREADY_VERIFIED');
    }

    // 2. 找这个用户最新一条、还没用过的验证码
    const [verificationRows]: any = await connection.query(
      `
      SELECT
        id,
        code_hash,
        expires_at
      FROM email_verifications
      WHERE user_id = ?
        AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [user.id]
    );

    if (verificationRows.length === 0) {
      throw new Error('VERIFICATION_CODE_NOT_FOUND');
    }

    const verification = verificationRows[0];

    // 3. 检查是否过期
    if (new Date(verification.expires_at) < new Date()) {
      throw new Error('VERIFICATION_CODE_EXPIRED');
    }

    // 4. hash 用户输入的验证码
    const inputCodeHash = hashVerificationCode(code);

    if (inputCodeHash !== verification.code_hash) {
      throw new Error('INVALID_VERIFICATION_CODE');
    }

    // 5. 标记验证码已使用
    await connection.query(
      `
      UPDATE email_verifications
      SET verified_at = NOW()
      WHERE id = ?
      `,
      [verification.id]
    );

    // 6. 激活用户
    await connection.query(
      `
      UPDATE users
      SET
        status = 'ACTIVE',
        email_verified_at = NOW()
      WHERE id = ?
      `,
      [user.id]
    );

    await connection.commit();

    const token = jwt.sign(
  {
    userId: user.id,
    email: user.email,
  },
  process.env.JWT_SECRET!,
  {
    expiresIn: '365d',
  }
);

return {
  token,
  user: {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  },
};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function resendVerificationCode(
  email: string,
  ipAddress?: string | null
) {
  const normalizedEmail = email.trim().toLowerCase();
  await checkOtpRateLimit({
  email: normalizedEmail,
  ipAddress,
});

  const [users]: any = await db.query(
    `
    SELECT id, status
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizedEmail]
  );

  if (users.length === 0) {
    throw new Error('USER_NOT_FOUND');
  }

  const user = users[0];

  if (user.status === 'ACTIVE') {
    throw new Error('EMAIL_ALREADY_VERIFIED');
  }

  // 生成新的验证码
  const verificationCode = generateVerificationCode();
  const codeHash = hashVerificationCode(verificationCode);

  // 先把之前未使用的验证码作废
  await db.query(
    `
    UPDATE email_verifications
    SET expires_at = NOW()
    WHERE user_id = ?
      AND verified_at IS NULL
    `,
    [user.id]
  );

  // 插入新的验证码
  await db.query(
    `
    INSERT INTO email_verifications (
      user_id,
      code_hash,
      expires_at
    )
    VALUES (
      ?,
      ?,
      DATE_ADD(NOW(), INTERVAL 10 MINUTE)
    )
    `,
    [user.id, codeHash]
  );

  // 发邮件
  try {
  await sendVerificationEmail(
    normalizedEmail,
    verificationCode
  );

  await logOtpEmail({
    email: normalizedEmail,
    ipAddress,
    status: 'SENT',
  });
} catch (error) {
  console.error(
    'Resend verification email failed:',
    error
  );

  await logOtpEmail({
    email: normalizedEmail,
    ipAddress,
    status: 'FAILED',
  });

  throw new Error('VERIFICATION_EMAIL_SEND_FAILED');
}

  return {
    email: normalizedEmail,
  };
}

export async function requestLoginCode(
  email: string,
  ipAddress?: string | null
) {
  const normalizedEmail = email.trim().toLowerCase();
  await checkOtpRateLimit({
  email: normalizedEmail,
  ipAddress,
});

  const [userRows]: any = await db.query(
    `
    SELECT
      id,
      email,
      status
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizedEmail]
  );

  if (userRows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  const user = userRows[0];

  if (user.status === 'PENDING_EMAIL_VERIFICATION') {
  throw new Error('EMAIL_NOT_VERIFIED');
    }

  if (user.status !== 'ACTIVE') {
      throw new Error('MEMBER_NOT_ACTIVE');
    }

  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 让之前还没使用的验证码失效
    await connection.query(
      `
      UPDATE email_verifications
      SET expires_at = NOW()
      WHERE user_id = ?
        AND verified_at IS NULL
      `,
      [user.id]
    );

    await connection.query(
      `
      INSERT INTO email_verifications (
        user_id,
        code_hash,
        expires_at
      )
      VALUES (
        ?,
        ?,
        DATE_ADD(NOW(), INTERVAL 10 MINUTE)
      )
      `,
      [user.id, codeHash]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (process.env.EMAIL_MODE === 'development') {
  console.log(
    `[LOGIN CODE] ${user.email}: ${code}`
  );
} else {
  try {
    await sendVerificationEmail(user.email, code);

    await logOtpEmail({
      email: user.email,
      ipAddress,
      status: 'SENT',
    });
  } catch (error) {
    console.error(
      'Login verification email failed:',
      error
    );

    await logOtpEmail({
      email: user.email,
      ipAddress,
      status: 'FAILED',
    });

    throw new Error(
      'VERIFICATION_EMAIL_SEND_FAILED'
    );
  }
}

  return {
    email: user.email,
  };
}

export async function verifyLoginCode(
  email: string,
  code: string
) {
  const normalizedEmail = email.trim().toLowerCase();

  const [userRows]: any = await db.query(
    `
    SELECT
      id,
      email,
      first_name AS firstName,
      last_name AS lastName,
      status
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizedEmail]
  );

  if (userRows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  const user = userRows[0];

  if (user.status !== 'ACTIVE') {
    throw new Error('MEMBER_NOT_ACTIVE');
  }

  const codeHash = hashVerificationCode(code);

  const [verificationRows]: any = await db.query(
    `
    SELECT
      id
    FROM email_verifications
    WHERE user_id = ?
      AND code_hash = ?
      AND verified_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [user.id, codeHash]
  );

  if (verificationRows.length === 0) {
    throw new Error('INVALID_OR_EXPIRED_CODE');
  }

  const verification = verificationRows[0];

  await db.query(
    `
    UPDATE email_verifications
    SET verified_at = NOW()
    WHERE id = ?
    `,
    [verification.id]
  );

  const token = jwt.sign(
  {
    userId: user.id,
    email: user.email,
  },
  process.env.JWT_SECRET!,
  {
    expiresIn: '365d',
  }
);

return {
  token,
  user: {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  },
};
}