import type { Request, Response } from 'express';
import { getReferralsByUserId } from '../services/referral.service.js';

export async function getUserReferrals(
  req: Request,
  res: Response
) {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const result = await getReferralsByUserId(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'USER_NOT_FOUND'
    ) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load referrals',
    });
  }
}