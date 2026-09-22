import type { Request, Response } from 'express';
import { getCustomerProfile,getReferralLink,getCustomerProfileByUserId } from '../services/customer.service.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';


export async function getCustomerProfileController(
  req: Request,
  res: Response
) {
  try {
    const email = String(req.query.email || '').trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const result = await getCustomerProfile(email);

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
      message: 'Failed to load member profile',
    });
  }
}

export async function getReferralLinkController(
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

    const result = await getReferralLink(userId);

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
      message: 'Failed to load referral link',
    });
  }
}

export async function getCurrentCustomerController(
  req: AuthRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const result =
      await getCustomerProfileByUserId(
        req.user.userId
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load membership',
    });
  }
}