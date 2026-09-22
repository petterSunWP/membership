import type { Request, Response } from 'express';
import {
  searchMember,
  getMemberDetail,
  getAvailableRewards,
} from '../services/member.service.js';

export async function searchMemberController(
  req: Request,
  res: Response
) {
  try {
    const keyword = String(
      req.query.keyword || ''
    ).trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required',
      });
    }

    const member = await searchMember(keyword);

    return res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'MEMBER_NOT_FOUND'
    ) {
      return res.status(404).json({
        success: false,
        message: 'Member not found',
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to search member',
    });
  }
}

export async function getMemberDetailController(
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

    const result = await getMemberDetail(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'MEMBER_NOT_FOUND'
    ) {
      return res.status(404).json({
        success: false,
        message: 'Member not found',
      });
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load member detail',
    });
  }
}
export async function getAvailableRewardsController(
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

    const result = await getAvailableRewards(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'MEMBER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Member not found',
        });
      }

      if (error.message === 'MEMBER_NOT_ACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Member is not active',
        });
      }
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load available rewards',
    });
  }
}