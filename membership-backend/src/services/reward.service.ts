import { db } from '../config/db.js';

export async function getActiveRewards() {
  const [rows] = await db.query(
    `
    SELECT
      id,
      name,
      description,
      points_required AS pointsRequired
    FROM rewards
    WHERE status = 'ACTIVE'
    ORDER BY points_required ASC
    `
  );

  return rows;
}