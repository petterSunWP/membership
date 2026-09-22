import { db } from '../config/db.js';
import { normalizeNZPhone } from '../utils/phone.js';

export async function searchMember(keyword: string) {
  const normalizedKeyword = keyword.trim();
  const normalizedPhone = normalizeNZPhone(normalizedKeyword);
  
  const [rows]: any = await db.query(
    `
    SELECT
      id,
      email,
      phone,
      first_name AS firstName,
      last_name AS lastName,
      referral_code AS referralCode,
      referred_by_user_id AS referredByUserId,
      available_points AS availablePoints,
      status,
      email_verified_at AS emailVerifiedAt,
      created_at AS createdAt
    FROM users
    WHERE email = ?
       OR phone = ?
    LIMIT 1
    `,
    [normalizedKeyword.toLowerCase(), normalizedKeyword]
  );

  if (rows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  return rows[0];
}

export async function getMemberDetail(userId: number) {
  const [memberRows]: any = await db.query(
    `
    SELECT
      id,
      email,
      phone,
      first_name AS firstName,
      last_name AS lastName,
      referral_code AS referralCode,
      referred_by_user_id AS referredByUserId,
      available_points AS availablePoints,
      status,
      email_verified_at AS emailVerifiedAt,
      created_at AS createdAt
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (memberRows.length === 0) {
    throw new Error('MEMBER_NOT_FOUND');
  }

  const member = memberRows[0];

  const [referralSummaryRows]: any = await db.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(status = 'REGISTERED') AS registered,
      SUM(status = 'ACTIVE') AS active
    FROM referrals
    WHERE referrer_user_id = ?
    `,
    [userId]
  );

  const referralSummary = referralSummaryRows[0];

  const [recentOrders]: any = await db.query(
    `
    SELECT
      id,
      order_no AS orderNo,
      total_amount AS totalAmount,
      total_points_earned AS totalPointsEarned,
      status,
      purchased_at AS purchasedAt
    FROM orders
    WHERE user_id = ?
    ORDER BY purchased_at DESC
    LIMIT 10
    `,
    [userId]
  );

  const [recentPointTransactions]: any = await db.query(
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
    LIMIT 20
    `,
    [userId]
  );

  return {
    member,
    referralSummary: {
      total: Number(referralSummary.total || 0),
      registered: Number(referralSummary.registered || 0),
      active: Number(referralSummary.active || 0),
    },
    recentOrders,
    recentPointTransactions,
  };
}
export async function getAvailableRewards(userId: number) {
  const [userRows]: any = await db.query(
    `
    SELECT
      id,
      available_points,
      status
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
    [user.available_points]
  );

  return {
    userId: user.id,
    availablePoints: Number(user.available_points),
    rewards: rewardRows,
  };
}