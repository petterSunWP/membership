import { db } from '../config/db.js';

interface RedeemInput {
  requestId: string;
  userId: number;
  rewardId: number;
}

export async function redeemReward(input: RedeemInput) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 幂等检查
    const [existingRows]: any = await connection.query(
      `
      SELECT
        id,
        user_id,
        reward_id,
        points_used,
        redemption_code,
        status
      FROM redemptions
      WHERE request_id = ?
      LIMIT 1
      `,
      [input.requestId]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];

      await connection.rollback();

      return {
        redemptionId: existing.id,
        userId: existing.user_id,
        rewardId: existing.reward_id,
        pointsUsed: existing.points_used,
        redemptionCode: existing.redemption_code,
        status: existing.status,
        duplicatedRequest: true,
      };
    }

    // 2. 查会员并锁住该用户记录
    const [userRows]: any = await connection.query(
      `
      SELECT
        id,
        available_points,
        status
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [input.userId]
    );

    if (userRows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = userRows[0];

    if (user.status !== 'ACTIVE') {
      throw new Error('USER_NOT_ACTIVE');
    }

    // 3. 查 Reward
    const [rewardRows]: any = await connection.query(
      `
      SELECT
        id,
        name,
        points_required
      FROM rewards
      WHERE id = ?
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [input.rewardId]
    );

    if (rewardRows.length === 0) {
      throw new Error('REWARD_NOT_FOUND');
    }

    const reward = rewardRows[0];
    const pointsRequired = Number(reward.points_required);
    const availablePoints = Number(user.available_points);

    // 4. 检查积分
    if (availablePoints < pointsRequired) {
      throw new Error('INSUFFICIENT_POINTS');
    }

    // 5. 生成兑换码
    const redemptionCode =
      `RDM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 6. 创建 redemption
    const [redemptionResult]: any =
      await connection.query(
        `
        INSERT INTO redemptions (
          request_id,
          user_id,
          reward_id,
          points_used,
          redemption_code,
          status,
          redeemed_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          'REDEEMED',
          NOW()
        )
        `,
        [
          input.requestId,
          input.userId,
          input.rewardId,
          pointsRequired,
          redemptionCode,
        ]
      );

    const redemptionId = redemptionResult.insertId;

    // 7. 扣当前余额
    await connection.query(
      `
      UPDATE users
      SET available_points =
        available_points - ?
      WHERE id = ?
      `,
      [pointsRequired, input.userId]
    );

    // 8. 写积分流水
    await connection.query(
      `
      INSERT INTO point_transactions (
        user_id,
        points,
        point_type,
        source_type,
        source_id,
        description
      )
      VALUES (
        ?,
        ?,
        'REDEMPTION',
        'REDEMPTION',
        ?,
        ?
      )
      `,
      [
        input.userId,
        -pointsRequired,
        redemptionId,
        `Redeemed reward: ${reward.name}`,
      ]
    );

    await connection.commit();

    return {
      redemptionId,
      userId: input.userId,
      rewardId: input.rewardId,
      rewardName: reward.name,
      pointsUsed: pointsRequired,
      redemptionCode,
      status: 'REDEEMED',
      duplicatedRequest: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getRecentRedemptions(
  page: number,
  pageSize: number
) {
  const offset = (page - 1) * pageSize;

  const [countRows]: any = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM redemptions
    `
  );

  const total = Number(countRows[0].total);

  const [rows]: any = await db.query(
    `
    SELECT
      r.id,
      r.redemption_code AS redemptionCode,
      r.user_id AS userId,
      CONCAT(u.first_name, ' ', u.last_name) AS customerName,
      u.email,
      u.phone,
      r.reward_id AS rewardId,
      rw.name AS rewardName,
      r.points_used AS pointsUsed,
      r.status,
      r.created_at AS createdAt,
      r.redeemed_at AS redeemedAt
    FROM redemptions r
    LEFT JOIN users u
      ON r.user_id = u.id
    LEFT JOIN rewards rw
      ON r.reward_id = rw.id
    ORDER BY COALESCE(r.redeemed_at, r.created_at) DESC
    LIMIT ?
    OFFSET ?
    `,
    [pageSize, offset]
  );

  return {
    redemptions: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}