import { db } from '../config/db.js';

export async function getStaffDashboard() {
  const [orderSummaryRows]: any = await db.query(
    `
    SELECT
      COUNT(*) AS todayOrders,
      COALESCE(SUM(total_points_earned), 0) AS todayPointsEarned
    FROM orders
    WHERE status = 'COMPLETED'
      AND DATE(purchased_at) = CURDATE()
    `
  );

  const [redemptionSummaryRows]: any = await db.query(
    `
    SELECT
      COUNT(*) AS todayRedemptions,
      COALESCE(SUM(points_used), 0) AS todayPointsRedeemed
    FROM redemptions
    WHERE status = 'REDEEMED'
      AND DATE(redeemed_at) = CURDATE()
    `
  );

  const [customerSummaryRows]: any = await db.query(
    `
    SELECT
      COUNT(*) AS activeCustomers
    FROM users
    WHERE status = 'ACTIVE'
    `
  );

  const [recentOrderRows]: any = await db.query(
    `
    SELECT
      o.id,
      o.order_no AS orderNo,
      o.user_id AS userId,
      CONCAT(u.first_name, ' ', u.last_name) AS customerName,
      o.total_points_earned AS totalPointsEarned,
      o.status,
      o.purchased_at AS purchasedAt
    FROM orders o
    LEFT JOIN users u
      ON o.user_id = u.id
    ORDER BY o.purchased_at DESC
    LIMIT 5
    `
  );

  const [recentRedemptionRows]: any = await db.query(
    `
    SELECT
      r.id,
      r.redemption_code AS redemptionCode,
      r.user_id AS userId,
      CONCAT(u.first_name, ' ', u.last_name) AS customerName,
      rw.name AS rewardName,
      r.points_used AS pointsUsed,
      r.status,
      r.redeemed_at AS redeemedAt
    FROM redemptions r
    LEFT JOIN users u
      ON r.user_id = u.id
    LEFT JOIN rewards rw
      ON r.reward_id = rw.id
    ORDER BY r.redeemed_at DESC
    LIMIT 5
    `
  );

  return {
    summary: {
      todayOrders:
        Number(orderSummaryRows[0].todayOrders) || 0,

      todayPointsEarned:
        Number(orderSummaryRows[0].todayPointsEarned) || 0,

      todayRedemptions:
        Number(
          redemptionSummaryRows[0].todayRedemptions
        ) || 0,

      todayPointsRedeemed:
        Number(
          redemptionSummaryRows[0].todayPointsRedeemed
        ) || 0,

      activeCustomers:
        Number(
          customerSummaryRows[0].activeCustomers
        ) || 0,
    },

    recentOrders: recentOrderRows,
    recentRedemptions: recentRedemptionRows,
  };
}