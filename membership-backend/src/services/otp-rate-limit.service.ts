import { db } from '../config/db.js';

const EMAIL_COOLDOWN_SECONDS = 60;
const EMAIL_DAILY_LIMIT = 5;
const IP_HOURLY_LIMIT = 100;

interface CheckOtpRateLimitInput {
  email: string;
  ipAddress?: string | null;
}

export async function checkOtpRateLimit(
  input: CheckOtpRateLimitInput
) {
  const email = input.email.trim().toLowerCase();
  const ipAddress = input.ipAddress || null;

  // 1. 同一个 email 60 秒内最多成功发送 1 次
  const [cooldownRows]: any = await db.query(
    `
    SELECT COUNT(*) AS count
    FROM email_send_logs
    WHERE email = ?
      AND email_type = 'AUTH_OTP'
      AND status = 'SENT'
      AND sent_at >= NOW() - INTERVAL ? SECOND
    `,
    [email, EMAIL_COOLDOWN_SECONDS]
  );

  if (Number(cooldownRows[0].count) > 0) {
    throw new Error('OTP_COOLDOWN');
  }

  // 2. 同一个 email 每天最多成功发送 5 次
  const [dailyRows]: any = await db.query(
    `
    SELECT COUNT(*) AS count
    FROM email_send_logs
    WHERE email = ?
      AND email_type = 'AUTH_OTP'
      AND status = 'SENT'
      AND DATE(sent_at) = CURDATE()
    `,
    [email]
  );

  if (Number(dailyRows[0].count) >= EMAIL_DAILY_LIMIT) {
    throw new Error('OTP_DAILY_LIMIT');
  }

  // 3. 同一个 IP 每小时最多 20 次 OTP 请求
  if (ipAddress) {
    const [ipRows]: any = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM email_send_logs
      WHERE ip_address = ?
        AND email_type = 'AUTH_OTP'
        AND sent_at >= NOW() - INTERVAL 1 HOUR
      `,
      [ipAddress]
    );

    if (Number(ipRows[0].count) >= IP_HOURLY_LIMIT) {
      throw new Error('OTP_IP_LIMIT');
    }
  }
}

interface LogOtpEmailInput {
  email: string;
  ipAddress?: string | null;
  status: 'SENT' | 'FAILED';
}

export async function logOtpEmail(
  input: LogOtpEmailInput
) {
  const email = input.email.trim().toLowerCase();

  await db.query(
    `
    INSERT INTO email_send_logs (
      email,
      ip_address,
      email_type,
      status,
      sent_at
    )
    VALUES (?, ?, 'AUTH_OTP', ?, NOW())
    `,
    [
      email,
      input.ipAddress || null,
      input.status,
    ]
  );
}