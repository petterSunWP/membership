import type { Request, Response } from 'express';
import { getActiveRewards } from '../services/reward.service.js';

export async function getRewardsController(
  req: Request,
  res: Response
) {
  try {
    const rewards = await getActiveRewards();

    return res.status(200).json({
      success: true,
      data: rewards,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load rewards',
    });
  }
}