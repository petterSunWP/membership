import { db } from '../config/db.js';

export async function getReferralsByUserId(userId: number) {
  // 先确认推荐人存在
  const [userRows]: any = await db.query(
    `
    SELECT id
    FROM users
    WHERE id = ?
      AND status = 'ACTIVE'
    LIMIT 1
    `,
    [userId]
  );

  if (userRows.length === 0) {
    throw new Error('USER_NOT_FOUND');
  }

  // 查询这个用户邀请的所有人
  const [rows]: any = await db.query(
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
    [userId]
  );

  const total = rows.length;

  const registered = rows.filter(
    (row: any) => row.status === 'REGISTERED'
  ).length;

  const active = rows.filter(
    (row: any) => row.status === 'ACTIVE'
  ).length;

  return {
    summary: {
      total,
      registered,
      active,
    },
    referrals: rows,
  };
}