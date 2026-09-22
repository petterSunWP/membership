import type { Request, Response } from 'express';
import { registerUser, verifyEmail, resendVerificationCode } from '../services/auth.service.js';
import {
  requestLoginCode,
  verifyLoginCode,
} from '../services/auth.service.js';


export async function register(
  req: Request,
  res: Response
) {
  try {
    const {
      email,
      phone,
      firstName,
      lastName,
      referralCode,
      marketingEmailOptIn,
    } = req.body;

    if (!email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email and phone are required',
      });
    }

    const result = await registerUser({
      email,
      phone,
      firstName,
      lastName,
      referralCode,
      marketingEmailOptIn,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'EMAIL_ALREADY_REGISTERED') {
        return res.status(409).json({
          success: false,
          message: 'Email is already registered',
        });
      }

      if (error.message === 'PHONE_ALREADY_REGISTERED') {
        return res.status(409).json({
          success: false,
          message: 'Phone number is already registered',
        });
      }

      if (error.message === 'INVALID_REFERRAL_CODE') {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code',
        });
      }
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
}

export async function verifyEmailController(
  req: Request,
  res: Response
) {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required',
      });
    }

    const result = await verifyEmail(email, code);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
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
          message: 'User not found',
        },

        EMAIL_ALREADY_VERIFIED: {
          status: 400,
          message: 'Email is already verified',
        },

        VERIFICATION_CODE_NOT_FOUND: {
          status: 400,
          message: 'Verification code not found',
        },

        VERIFICATION_CODE_EXPIRED: {
          status: 400,
          message: 'Verification code has expired',
        },

        INVALID_VERIFICATION_CODE: {
          status: 400,
          message: 'Invalid verification code',
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
      message: 'Email verification failed',
    });
  }
}
export async function resendVerificationCodeController(
  req: Request,
  res: Response
) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const result = await resendVerificationCode(email);

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent',
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
          message: 'User not found',
        },

        EMAIL_ALREADY_VERIFIED: {
          status: 400,
          message: 'Email is already verified',
        },

        VERIFICATION_EMAIL_SEND_FAILED: {
          status: 500,
          message: 'Failed to send verification email',
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
      message: 'Failed to resend verification code',
    });
  }
}

export async function requestLoginCodeController(
  req: Request,
  res: Response
) {
  try {
    const email = String(req.body.email || '').trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const result = await requestLoginCode(email);

    return res.status(200).json({
      success: true,
      message: 'Login code sent',
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
      message: 'Failed to send login code',
    });
  }
}

export async function verifyLoginCodeController(
  req: Request,
  res: Response
) {
  try {
    const email = String(req.body.email || '').trim();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and code are required',
      });
    }

    const result = await verifyLoginCode(
      email,
      code
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
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

      if (
        error.message === 'INVALID_OR_EXPIRED_CODE'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid or expired verification code',
        });
      }
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Login verification failed',
    });
  }
}