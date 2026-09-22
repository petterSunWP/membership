import type { Request, Response } from 'express';
import { redeemReward, getRecentRedemptions } from '../services/redemption.service.js';

export async function redeemRewardController(
  req: Request,
  res: Response
) {
  try {
    const {
      requestId,
      userId,
      rewardId,
    } = req.body;

    if (!requestId || !userId || !rewardId) {
      return res.status(400).json({
        success: false,
        message: 'requestId, userId and rewardId are required',
      });
    }

    const result = await redeemReward({
      requestId,
      userId: Number(userId),
      rewardId: Number(rewardId),
    });

    return res.status(200).json({
      success: true,
      message: result.duplicatedRequest
        ? 'Redemption already processed'
        : 'Reward redeemed successfully',
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

        REWARD_NOT_FOUND: {
          status: 404,
          message: 'Reward not found or inactive',
        },

        INSUFFICIENT_POINTS: {
          status: 400,
          message: 'Insufficient points',
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
      message: 'Failed to redeem reward',
    });
  }
}
export async function getRecentRedemptionsController(
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

    const result =
      await getRecentRedemptions(
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
      message: 'Failed to load redemptions',
    });
  }
}