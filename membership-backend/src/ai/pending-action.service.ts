import { db } from '../config/db.js';
import { executeAITool, getAITool } from './tools/tool.registry.js';

export async function createPendingAction(input: {
  staffUserId: number;
  toolName: string;
  args: unknown;
}) {
  const [result]: any = await db.query(
    `
    INSERT INTO ai_pending_actions (
      staff_user_id,
      tool_name,
      arguments_json,
      status,
      expires_at
    )
    VALUES (
      ?,
      ?,
      ?,
      'PENDING',
      DATE_ADD(NOW(), INTERVAL 10 MINUTE)
    )
    `,
    [
      input.staffUserId,
      input.toolName,
      JSON.stringify(input.args),
    ]
  );

  return {
    id: result.insertId,
    toolName: input.toolName,
    status: 'PENDING',
    expiresInMinutes: 10,
  };
}




export async function confirmPendingAction(
  actionId: number,
  staffUserId: number
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows]: any = await connection.query(
      `
      SELECT
        id,
        staff_user_id AS staffUserId,
        tool_name AS toolName,
        arguments_json AS argumentsJson,
        status,
        expires_at AS expiresAt
      FROM ai_pending_actions
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [actionId]
    );

    if (rows.length === 0) {
      throw new Error('PENDING_ACTION_NOT_FOUND');
    }

    const action = rows[0];

    if (Number(action.staffUserId) !== staffUserId) {
      throw new Error('PENDING_ACTION_FORBIDDEN');
    }

    if (action.status !== 'PENDING') {
      throw new Error('PENDING_ACTION_NOT_PENDING');
    }

    if (new Date(action.expiresAt).getTime() < Date.now()) {
      await connection.query(
        `
        UPDATE ai_pending_actions
        SET status = 'EXPIRED'
        WHERE id = ?
        `,
        [actionId]
      );

      await connection.commit();

      throw new Error('PENDING_ACTION_EXPIRED');
    }

    await connection.query(
      `
      UPDATE ai_pending_actions
      SET
        status = 'CONFIRMED',
        confirmed_at = NOW()
      WHERE id = ?
      `,
      [actionId]
    );

    await connection.commit();

    const args =
      typeof action.argumentsJson === 'string'
        ? JSON.parse(action.argumentsJson)
        : action.argumentsJson;

    try {
        const tool = getAITool(action.toolName);

        if (
        tool.accessType !== 'ACTION' ||
        !tool.requiresConfirmation
        ) {
        throw new Error('INVALID_ACTION_TOOL');
        }
      const result = await executeAITool(
        action.toolName,
        args
      );

      await db.query(
        `
        UPDATE ai_pending_actions
        SET
          status = 'COMPLETED',
          executed_at = NOW(),
          result_json = ?
        WHERE id = ?
        `,
        [
          JSON.stringify(result),
          actionId,
        ]
      );

      return {
        actionId,
        status: 'COMPLETED',
        toolName: action.toolName,
        result,
      };
    } catch (error: any) {
      await db.query(
        `
        UPDATE ai_pending_actions
        SET
          status = 'FAILED',
          error_message = ?
        WHERE id = ?
        `,
        [
          error?.message ?? 'Unknown execution error',
          actionId,
        ]
      );

      throw error;
    }
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}

    throw error;
  } finally {
    connection.release();
  }
}

export async function cancelPendingAction(
  actionId: number,
  staffUserId: number
) {
  const [rows]: any = await db.query(
    `
    SELECT
      id,
      staff_user_id AS staffUserId,
      status,
      expires_at AS expiresAt
    FROM ai_pending_actions
    WHERE id = ?
    LIMIT 1
    `,
    [actionId]
  );

  if (rows.length === 0) {
    throw new Error('PENDING_ACTION_NOT_FOUND');
  }

  const action = rows[0];

  if (Number(action.staffUserId) !== staffUserId) {
    throw new Error('PENDING_ACTION_FORBIDDEN');
  }

  if (action.status !== 'PENDING') {
    throw new Error('PENDING_ACTION_NOT_PENDING');
  }

  if (new Date(action.expiresAt).getTime() < Date.now()) {
    await db.query(
      `
      UPDATE ai_pending_actions
      SET status = 'EXPIRED'
      WHERE id = ?
      `,
      [actionId]
    );

    throw new Error('PENDING_ACTION_EXPIRED');
  }

  await db.query(
    `
    UPDATE ai_pending_actions
    SET status = 'CANCELLED'
    WHERE id = ?
    `,
    [actionId]
  );

  return {
    actionId,
    status: 'CANCELLED',
  };
}

export async function getAIActionHistory(
  staffUserId: number,
  limit = 20
) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const [rows]: any = await db.query(
    `
    SELECT
      id,
      tool_name AS toolName,
      arguments_json AS argumentsJson,
      status,
      expires_at AS expiresAt,
      confirmed_at AS confirmedAt,
      executed_at AS executedAt,
      result_json AS resultJson,
      error_message AS errorMessage,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM ai_pending_actions
    WHERE staff_user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [staffUserId, safeLimit]
  );

  return rows;
}