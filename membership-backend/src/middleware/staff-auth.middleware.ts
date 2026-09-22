import type {
  NextFunction,
  Request,
  Response,
} from 'express';

import jwt from 'jsonwebtoken';

export interface StaffAuthRequest
  extends Request {
  staff?: {
    staffUserId: number;
    email: string;
    role: string;
  };
}

export function requireStaffAuth(
  req: StaffAuthRequest,
  res: Response,
  next: NextFunction
) {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      success: false,
      message: 'Staff authentication required',
    });
  }

  const token = authorization.substring(7);

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as {
      staffUserId: number;
      email: string;
      role: string;
      tokenType: string;
    };

    if (decoded.tokenType !== 'STAFF') {
      return res.status(401).json({
        success: false,
        message: 'Invalid staff session',
      });
    }

    req.staff = {
      staffUserId: decoded.staffUserId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired staff session',
    });
  }
}