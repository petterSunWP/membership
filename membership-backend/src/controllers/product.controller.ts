import type { Request, Response } from 'express';
import { getActiveProducts } from '../services/product.service.js';

export async function getProducts(
  req: Request,
  res: Response
) {
  try {
    const products = await getActiveProducts();

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load products',
    });
  }
}