import { db } from '../config/db.js';

interface OrderItemInput {
  productId: number;
  quantity: number;
}

interface CreateOrderInput {
  requestId: string;
  userId: number;
  items: OrderItemInput[];
}



export async function createOrder(input: CreateOrderInput) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
        //0.检查订单有没有处理过
        const [existingOrders]: any = await connection.query(
    `
    SELECT
        id,
        order_no,
        user_id,
        total_amount,
        total_points_earned
    FROM orders
    WHERE request_id = ?
    LIMIT 1
    `,
    [input.requestId]
    );

    if (existingOrders.length > 0) {
    const existing = existingOrders[0];

    await connection.rollback();

    return {
        orderId: existing.id,
        orderNo: existing.order_no,
        userId: existing.user_id,
        totalAmount: Number(existing.total_amount),
        totalPointsEarned: existing.total_points_earned,
        duplicatedRequest: true,
    };
    }

    // 1. 检查会员
    const [userRows]: any = await connection.query(
      `
      SELECT
        id,
        status,
        referred_by_user_id
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

    if (!input.items || input.items.length === 0) {
      throw new Error('EMPTY_ORDER');
    }

    let totalAmount = 0;
    let totalPoints = 0;

    const orderItems = [];

    // 2. 后端逐个读取商品真实配置
    for (const item of input.items) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new Error('INVALID_QUANTITY');
      }

      const [productRows]: any =
        await connection.query(
          `
          SELECT
            id,
            name,
            price,
            points_earned
          FROM products
          WHERE id = ?
            AND status = 'ACTIVE'
          LIMIT 1
          `,
          [item.productId]
        );

      if (productRows.length === 0) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const product = productRows[0];

      const unitPrice = Number(product.price);
      const pointsPerItem = Number(product.points_earned);

      const lineAmount =
        unitPrice * item.quantity;

      const linePoints =
        pointsPerItem * item.quantity;

      totalAmount += lineAmount;
      totalPoints += linePoints;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        pointsPerItem,
        totalPoints: linePoints,
      });
    }

    // 避免 JS 浮点金额问题
    totalAmount = Number(totalAmount.toFixed(2));

    // 3. 生成订单号
    const orderNo =
      `ORD-${Date.now()}-${Math.floor(
        Math.random() * 1000
      )}`;

    // 4. 创建订单
    const [orderResult]: any =
      await connection.query(
        `
        INSERT INTO orders (
        request_id,
          order_no,
          user_id,
          total_amount,
          total_points_earned,
          status,
          purchased_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          'COMPLETED',
          NOW()
        )
        `,
        [
          input.requestId,
          orderNo,
          input.userId,
          totalAmount,
          totalPoints,
        ]
      );

    const orderId = orderResult.insertId;

    // 5. 写 order_items 快照
    for (const item of orderItems) {
      await connection.query(
        `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name,
          unit_price,
          quantity,
          points_per_item,
          total_points
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          item.productId,
          item.productName,
          item.unitPrice,
          item.quantity,
          item.pointsPerItem,
          item.totalPoints,
        ]
      );
    }

    // 6. 给消费者发积分
    if (totalPoints > 0) {
      await connection.query(
        `
        INSERT INTO point_transactions (
          user_id,
          points,
          point_type,
          source_type,
          source_id,
          order_id,
          description
        )
        VALUES (
          ?,
          ?,
          'PURCHASE',
          'ORDER',
          ?,
          ?,
          ?
        )
        `,
        [
          input.userId,
          totalPoints,
          orderId,
          orderId,
          `Points earned from order ${orderNo}`,
        ]
      );

      await connection.query(
        `
        UPDATE users
        SET available_points =
          available_points + ?
        WHERE id = ?
        `,
        [totalPoints, input.userId]
      );
    }

    // 7. 检查 Referral relationship
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

    let referralReward = 0;

    if (referralRows.length > 0) {
      const referral = referralRows[0];

      referralReward = Number(
        process.env.REFERRAL_PURCHASE_POINTS || 1
      );

      // 8. 给推荐人积分
      if (referralReward > 0) {
        await connection.query(
          `
          INSERT INTO point_transactions (
            user_id,
            points,
            point_type,
            source_type,
            source_id,
            order_id,
            related_user_id,
            description
          )
          VALUES (
            ?,
            ?,
            'REFERRAL',
            'ORDER',
            ?,
            ?,
            ?,
            ?
          )
          `,
          [
            referral.referrer_user_id,
            referralReward,
            orderId,
            orderId,
            input.userId,
            `Referral reward from order ${orderNo}`,
          ]
        );

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

      // 9. 第一次消费：REGISTERED → ACTIVE
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

    await connection.commit();

    return {
      orderId,
      orderNo,
      userId: input.userId,
      totalAmount,
      totalPointsEarned: totalPoints,
      referralReward,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getRecentOrders(
  page: number,
  pageSize: number
) {
  const offset = (page - 1) * pageSize;

  const [countRows]: any = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM orders
    `
  );

  const total = Number(countRows[0].total);

  const [rows]: any = await db.query(
    `
    SELECT
      o.id,
      o.order_no AS orderNo,
      o.user_id AS userId,
      CONCAT(u.first_name, ' ', u.last_name) AS customerName,
      u.email,
      u.phone,
      o.total_amount AS totalAmount,
      o.total_points_earned AS totalPointsEarned,
      o.status,
      o.purchased_at AS purchasedAt
    FROM orders o
    LEFT JOIN users u
      ON o.user_id = u.id
    ORDER BY o.purchased_at DESC
    LIMIT ?
    OFFSET ?
    `,
    [pageSize, offset]
  );

  return {
    orders: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}