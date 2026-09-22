import type { Request, Response } from 'express';
import { askAI } from '../ai/ai.service.js';
import {
  confirmPendingAction,
  cancelPendingAction,
  getAIActionHistory,
} from '../ai/pending-action.service.js';

export async function askAIController(
  req: Request,
  res: Response
) {
  try {
    const { message } = req.body;

    if (
      typeof message !== 'string' ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        message: 'Message is required',
      });
    }
    const staffUserId = req.staff?.staffUserId;
    
    if (!staffUserId) {
      return res.status(401).json({
        message: 'Staff authentication required',
      });
    }

    const result = await askAI(message.trim(), staffUserId);

    return res.json(result);
  } catch (error) {
    console.error('AI chat error:', error);

    return res.status(500).json({
      message: 'AI request failed',
    });
  }
}

export async function confirmAIActionController(
  req: Request,
  res: Response
) {
  try {
    const staffUserId = req.staff?.staffUserId;

    if (!staffUserId) {
      return res.status(401).json({
        message: 'Staff authentication required',
      });
    }

    const actionId = Number(req.params.id);

    if (!Number.isInteger(actionId) || actionId <= 0) {
      return res.status(400).json({
        message: 'Invalid action ID',
      });
    }

    const result = await confirmPendingAction(
      actionId,
      staffUserId
    );

    return res.json(result);
  } catch (error: any) {
    console.error(
      'Confirm AI action error:',
      error
    );

    switch (error.message) {
      case 'PENDING_ACTION_NOT_FOUND':
        return res.status(404).json({
          message: 'Pending action not found',
        });

      case 'PENDING_ACTION_FORBIDDEN':
        return res.status(403).json({
          message: 'You cannot confirm this action',
        });

      case 'PENDING_ACTION_NOT_PENDING':
        return res.status(409).json({
          message:
            'This action is no longer pending',
        });

      case 'PENDING_ACTION_EXPIRED':
        return res.status(410).json({
          message: 'This action has expired',
        });

      default:
        return res.status(500).json({
          message: 'Failed to execute AI action',
        });
    }
  }
}

export async function cancelAIActionController(
  req: Request,
  res: Response
) {
  try {
    const staffUserId = req.staff?.staffUserId;

    if (!staffUserId) {
      return res.status(401).json({
        message: 'Staff authentication required',
      });
    }

    const actionId = Number(req.params.id);

    if (!Number.isInteger(actionId) || actionId <= 0) {
      return res.status(400).json({
        message: 'Invalid action ID',
      });
    }

    const result = await cancelPendingAction(
      actionId,
      staffUserId
    );

    return res.json(result);
  } catch (error: any) {
    switch (error.message) {
      case 'PENDING_ACTION_NOT_FOUND':
        return res.status(404).json({
          message: 'Pending action not found',
        });

      case 'PENDING_ACTION_FORBIDDEN':
        return res.status(403).json({
          message: 'You cannot cancel this action',
        });

      case 'PENDING_ACTION_NOT_PENDING':
        return res.status(409).json({
          message: 'This action is no longer pending',
        });

      case 'PENDING_ACTION_EXPIRED':
        return res.status(410).json({
          message: 'This action has expired',
        });

      default:
        console.error('Cancel AI action error:', error);

        return res.status(500).json({
          message: 'Failed to cancel AI action',
        });
    }
  }
}

export async function getAIActionHistoryController(
  req: Request,
  res: Response
) {
  try {
    const staffUserId = req.staff?.staffUserId;

    if (!staffUserId) {
      return res.status(401).json({
        message: 'Staff authentication required',
      });
    }

    const limit = Number(req.query.limit ?? 20);

    const actions = await getAIActionHistory(
      staffUserId,
      limit
    );

    return res.json({
      actions,
    });
  } catch (error) {
    console.error(
      'Get AI action history error:',
      error
    );

    return res.status(500).json({
      message: 'Failed to get AI action history',
    });
  }
}