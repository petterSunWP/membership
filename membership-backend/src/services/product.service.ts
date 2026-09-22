import { db } from '../config/db.js';

export async function getActiveProducts() {
  const [rows] = await db.query(
    `
    SELECT
      id,
      product_code AS productCode,
      name,
      price,
      points_earned AS pointsEarned
    FROM products
    WHERE status = 'ACTIVE'
    ORDER BY id ASC
    `
  );

  return rows;
}