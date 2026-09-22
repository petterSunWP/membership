import { Router } from 'express';
import { createOrderController } from '../controllers/order.controller.js';
import {
  requireStaffAuth,
} from '../middleware/staff-auth.middleware.js';

const router = Router();

router.post('/', requireStaffAuth, createOrderController);

export default router;