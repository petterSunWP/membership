import { db } from '../config/db.js';
import {
  calculateReferralReward,
} from '../rules/referral-rules.js';

type AdjustmentType =
  | 'QUICK_EARN'
  | 'PHYSICAL_CARD_IMPORT';

interface CreateManualPointAdjustmentInput {
  requestId: string;
  userId: number;
  staffUserId: number;
  adjustmentType: AdjustmentType;
  quantity: number;
  note?: string;
}

export async function createManualPointAdjustment(
  input: CreateManualPointAdjustmentInput
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 幂等：同一个 requestId 不能重复处理
    const [existingRows]: any = await connection.query(
      `
      SELECT
        id,
        user_id,
        adjustment_type,
        quantity,
        points,
        created_at
      FROM manual_point_adjustments
      WHERE request_id = ?
      LIMIT 1
      `,
      [input.requestId]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];

      await connection.rollback();

      return {
        adjustmentId: existing.id,
        userId: existing.user_id,
        adjustmentType: existing.adjustment_type,
        quantity: existing.quantity,
        points: Number(existing.points),
        createdAt: existing.created_at,
        duplicatedRequest: true,
      };
    }

    // 2. 检查 adjustment type
    if (
      input.adjustmentType !== 'QUICK_EARN' &&
      input.adjustmentType !== 'PHYSICAL_CARD_IMPORT'
    ) {
      throw new Error('INVALID_ADJUSTMENT_TYPE');
    }

    // 3. 检查 quantity
    if (
      !Number.isInteger(input.quantity) ||
      input.quantity <= 0 ||
      input.quantity > 100
    ) {
      throw new Error('INVALID_QUANTITY');
    }

    // 4. 检查会员
    const [userRows]: any = await connection.query(
      `
      SELECT
        id,
        status,
        available_points
      FROM users
      WHERE id = ?
      LIMIT 1
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

    // 5. 实体卡迁移：同一个会员默认只能做一次
    if (input.adjustmentType === 'PHYSICAL_CARD_IMPORT') {
      const [importRows]: any = await connection.query(
        `
        SELECT id
        FROM manual_point_adjustments
        WHERE user_id = ?
          AND adjustment_type = 'PHYSICAL_CARD_IMPORT'
        LIMIT 1
        `,
        [input.userId]
      );

      if (importRows.length > 0) {
        throw new Error(
          'PHYSICAL_CARD_ALREADY_IMPORTED'
        );
      }
    }

    // 6. 系统根据规则计算 points
    let points = 0;

    if (input.adjustmentType === 'QUICK_EARN') {
      // 当前规则：1 item = 1 point
      points = input.quantity * 1;
    }

    if (
      input.adjustmentType ===
      'PHYSICAL_CARD_IMPORT'
    ) {
      // 当前规则：1 stamp = 1 point
      points = input.quantity * 1;
    }

    // 7. 创建 manual adjustment 记录
const [adjustmentResult]: any =
  await connection.query(
    `
    INSERT INTO manual_point_adjustments (
      request_id,
      user_id,
      staff_user_id,
      adjustment_type,
      quantity,
      points,
      note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.requestId,
      input.userId,
      input.staffUserId,
      input.adjustmentType,
      input.quantity,
      points,
      input.note?.trim() || null,
    ]
  );

const adjustmentId = adjustmentResult.insertId;

// 8. 给消费者写积分流水
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
    'MANUAL_ADJUSTMENT',
    'MANUAL_POINT_ADJUSTMENT',
    ?,
    ?
  )
  `,
  [
    input.userId,
    points,
    adjustmentId,
    input.adjustmentType === 'QUICK_EARN'
      ? `Quick earn: ${input.quantity} item(s)`
      : `Imported ${input.quantity} physical stamp(s)`,
  ]
);

// 9. 更新消费者积分余额
await connection.query(
  `
  UPDATE users
  SET available_points =
    available_points + ?
  WHERE id = ?
  `,
  [points, input.userId]
);

// 10. QUICK_EARN 才触发 Referral
let referralReward = 0;

if (input.adjustmentType === 'QUICK_EARN') {
  const [referralRows]: any =
    await connection.query(
      `
      SELECT
        id,
        referrer_user_id,
        status
      FROM referrals
      WHERE referred_user_id = ?
      LIMIT 1
      `,
      [input.userId]
    );

  if (referralRows.length > 0) {
    const referral = referralRows[0];

    referralReward =
  calculateReferralReward(
    referral.status,
    input.quantity
  );

    if (referralReward > 0) {
      // 给邀请人写积分流水
      await connection.query(
        `
        INSERT INTO point_transactions (
          user_id,
          points,
          point_type,
          source_type,
          source_id,
          related_user_id,
          description
        )
        VALUES (
          ?,
          ?,
          'REFERRAL',
          'MANUAL_POINT_ADJUSTMENT',
          ?,
          ?,
          ?
        )
        `,
        [
          referral.referrer_user_id,
          referralReward,
          adjustmentId,
          input.userId,
          `Referral reward from quick earn adjustment ${adjustmentId}`,
        ]
      );

      // 更新邀请人积分
      await connection.query(
        `
        UPDATE users
        SET available_points =
          available_points + ?
        WHERE id = ?
        `,
        [
          referralReward,
          referral.referrer_user_id,
        ]
      );
    }

    // 第一次真实消费后激活 referral
    if (referral.status === 'REGISTERED') {
      await connection.query(
        `
        UPDATE referrals
        SET
          status = 'ACTIVE',
          converted_at = NOW()
        WHERE id = ?
        `,
        [referral.id]
      );
    }
  }
}

// 11. 提交整个 transaction
await connection.commit();

return {
  adjustmentId,
  userId: input.userId,
  adjustmentType: input.adjustmentType,
  quantity: input.quantity,
  pointsEarned: points,
  referralReward,
  newAvailablePoints:
    Number(user.available_points) + points,
  duplicatedRequest: false,
};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}