import type { Request, Response } from 'express';
import { createOrder, getRecentOrders } from '../services/order.service.js';

export async function createOrderController(
  req: Request,
  res: Response
) {
  try {
    const {requestId, userId, items } = req.body;

    if (!requestId || !userId || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'userId and items are required',
      });
    }

    const result = await createOrder({
      requestId,
      userId: Number(userId),
      items,
    });

    return res.status(201).json({
      success: true,
      message: 'Order completed successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      const errorMap: Record<
        string,
        { status: number; message: string }
      > = {
        USER_NOT_FOUND: {
          status: 404,
          message: 'Member not found',
        },

        USER_NOT_ACTIVE: {
          status: 400,
          message: 'Member is not active',
        },

        EMPTY_ORDER: {
          status: 400,
          message: 'Order cannot be empty',
        },

        INVALID_QUANTITY: {
          status: 400,
          message: 'Invalid product quantity',
        },

        PRODUCT_NOT_FOUND: {
          status: 400,
          message: 'Product not found or inactive',
        },
      };

      const mapped = errorMap[error.message];

      if (mapped) {
        return res.status(mapped.status).json({
          success: false,
          message: mapped.message,
        });
      }
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create order',
    });
  }
}
export async function getRecentOrdersController(
  req: Request,
  res: Response
) {
  try {
    const page = Math.max(
      1,
      Number(req.query.page) || 1
    );

    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number(req.query.pageSize) || 20
      )
    );

    const result = await getRecentOrders(
      page,
      pageSize
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load orders',
    });
  }
}