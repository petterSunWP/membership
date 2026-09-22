import type { Request, Response } from 'express';

import { loginStaff } from '../services/staff-auth.service.js';

export async function loginStaffController(
  req: Request,
  res: Response
) {
  try {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const result = await loginStaff(
      email,
      password
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'INVALID_CREDENTIALS'
      ) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      if (
        error.message === 'STAFF_NOT_ACTIVE'
      ) {
        return res.status(403).json({
          success: false,
          message: 'Staff account is not active',
        });
      }
    }

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to login',
    });
  }
}