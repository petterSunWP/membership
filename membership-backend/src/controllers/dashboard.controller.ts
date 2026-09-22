import type { Request, Response } from 'express';
import { getStaffDashboard } from '../services/dashboard.service.js';

export async function getStaffDashboardController(
  req: Request,
  res: Response
) {
  try {
    const result = await getStaffDashboard();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard',
    });
  }
}