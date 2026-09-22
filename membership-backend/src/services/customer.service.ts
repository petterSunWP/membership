import { db } from '../config/db.js';

export async function getCustomerProfile(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const [userRows]: any = await db.query(
    `
    SELECT
      id,
      email,
      phone,
      first_name AS firstName,
      last_name AS lastName,
      referral_code AS referralCode,
      available_points AS availablePoints,
      status,
      created_at AS createdAt
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

  const [referralRows]: any = await db.query(
    `
    SELECT
      r.referred_user_id AS userId,
      u.first_name AS firstName,
      u.last_name AS lastName,
      r.status,
      r.registered_at AS registeredAt,
      r.converted_at AS convertedAt
    FROM referrals r
    LEFT JOIN users u
      ON r.referred_user_id = u.id
    WHERE r.referrer_user_id = ?
    ORDER BY r.registered_at DESC
    `,
    [user.id]
  );

  const total = referralRows.length;

  const registered = referralRows.filter(
    (row: any) => row.status === 'REGISTERED'
  ).length;

  const active = referralRows.filter(
    (row: any) => row.status === 'ACTIVE'
  ).length;

  const [rewardRows]: any = await db.query(
    `
    SELECT
      id,
      name,
      description,
      points_required AS pointsRequired
    FROM rewards
    WHERE status = 'ACTIVE'
      AND points_required <= ?
    ORDER BY points_required ASC
    `,
    [user.availablePoints]
  );

  return {
    member: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      availablePoints: Number(user.availablePoints),
      referralCode: user.referralCode,
      createdAt: user.createdAt,
    },

    referralSummary: {
      total,
      registered,
      active,
    },

    referrals: referralRows,

    availableRewards: rewardRows,
  };
}

export async function getReferralLink(userId: number) {
  const [rows]: any = await db.query(
    `
    SELECT
      id,
      referral_code AS referralCode,
      status
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  const user = rows[0];

  if (user.status !== 'ACTIVE') {
    throw new Error('MEMBER_NOT_ACTIVE');
  }

  const baseUrl =
    process.env.CUSTOMER_WEB_URL ||
    'http://localhost:5173';

  const referralLink =
    `${baseUrl}/register?ref=${encodeURIComponent(
      user.referralCode
    )}`;

  return {
    referralCode: user.referralCode,
    referralLink,
  };
}

export async function getCustomerProfileByUserId(
  userId: number
) {
  const [userRows]: any = await db.query(
    `
    SELECT
      id,
      email,
      phone,
      first_name AS firstName,
      last_name AS lastName,
      referral_code AS referralCode,
      available_points AS availablePoints,
      status,
      created_at AS createdAt
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  const user = userRows[0];

  if (user.status !== 'ACTIVE') {
    throw new Error('MEMBER_NOT_ACTIVE');
  }

  const [referralRows]: any = await db.query(
    `
    SELECT
      r.referred_user_id AS userId,
      u.first_name AS firstName,
      u.last_name AS lastName,
      r.status,
      r.registered_at AS registeredAt,
      r.converted_at AS convertedAt
    FROM referrals r
    LEFT JOIN users u
      ON r.referred_user_id = u.id
    WHERE r.referrer_user_id = ?
    ORDER BY r.registered_at DESC
    `,
    [user.id]
  );

  const total = referralRows.length;

  const registered = referralRows.filter(
    (row: any) => row.status === 'REGISTERED'
  ).length;

  const active = referralRows.filter(
    (row: any) => row.status === 'ACTIVE'
  ).length;

  const [rewardRows]: any = await db.query(
  `
  SELECT
    id,
    name,
    description,
    points_required AS pointsRequired
  FROM rewards
  WHERE status = 'ACTIVE'
  ORDER BY points_required ASC
  `
);
const rewards = rewardRows.map((reward: any) => ({
  id: reward.id,
  name: reward.name,
  description: reward.description,
  pointsRequired: Number(reward.pointsRequired),
  canRedeem:
    Number(user.availablePoints) >=
    Number(reward.pointsRequired),
}));

const [pointTransactionRows]: any = await db.query(
  `
  SELECT
    id,
    points,
    point_type AS pointType,
    source_type AS sourceType,
    source_id AS sourceId,
    description,
    created_at AS createdAt
  FROM point_transactions
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT 50
  `,
  [user.id]
);
  return {
  member: {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    availablePoints: Number(user.availablePoints),
    referralCode: user.referralCode,
    createdAt: user.createdAt,
  },

  referralSummary: {
    total,
    registered,
    active,
  },

  referrals: referralRows,

  rewards,
  pointHistory: pointTransactionRows
};
}