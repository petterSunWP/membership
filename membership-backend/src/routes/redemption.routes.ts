import { Router } from 'express';
import { redeemRewardController } from '../controllers/redemption.controller.js';
import {
  requireStaffAuth,
} from '../middleware/staff-auth.middleware.js';
const router = Router();

router.post('/', requireStaffAuth, redeemRewardController);

export default router;