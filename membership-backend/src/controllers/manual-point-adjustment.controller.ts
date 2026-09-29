import type { Request, Response } from 'express';
import { createManualPointAdjustment } from '../services/manual-point-adjustment.service.js';

export async function createManualPointAdjustmentController(
  req: Request,
  res: Response
) {
  try {
    const {
      requestId,
      userId,
      adjustmentType,
      quantity,
      note,
    } = req.body;

    if (
      !requestId ||
      !userId ||
      !adjustmentType ||
      quantity === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          'requestId, userId, adjustmentType and quantity are required',
      });
    }

    if (!req.staff) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const result =
      await createManualPointAdjustment({
        requestId: String(requestId),
        userId: Number(userId),
        staffUserId: req.staff.staffUserId,
        adjustmentType,
        quantity: Number(quantity),
        note:
          typeof note === 'string'
            ? note
            : undefined,
      });

    return res.status(201).json({
      success: true,
      message: 'Points updated successfully',
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

        INVALID_ADJUSTMENT_TYPE: {
          status: 400,
          message: 'Invalid adjustment type',
        },

        INVALID_QUANTITY: {
          status: 400,
          message:
            'Quantity must be a whole number between 1 and 100',
        },

        PHYSICAL_CARD_ALREADY_IMPORTED: {
          status: 409,
          message:
            'Physical card points have already been imported for this member',
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

    console.error(
      'Create manual point adjustment failed:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to update points',
    });
  }
}