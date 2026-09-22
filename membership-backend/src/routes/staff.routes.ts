import { Router } from 'express';
import {
  searchMemberController,
  getMemberDetailController,
  getAvailableRewardsController
} from '../controllers/member.controller.js';
import {getRecentOrdersController} from  '../controllers/order.controller.js'
import {getRecentRedemptionsController} from '../controllers/redemption.controller.js'
import {
  getStaffDashboardController,
} from '../controllers/dashboard.controller.js';
import {
  requireStaffAuth,
} from '../middleware/staff-auth.middleware.js';

import aiRoutes from './ai.routes.js';

const router = Router();
router.use(requireStaffAuth);
router.use('/ai', aiRoutes);

router.get(
  '/members/search',
  searchMemberController
);

router.get(
  '/members/:userId',
  getMemberDetailController
);
router.get(
  '/members/:userId/available-rewards',
  getAvailableRewardsController
);
router.get(
  '/orders',
  getRecentOrdersController
);
router.get(
  '/redemptions',
  getRecentRedemptionsController
);
router.get(
  '/dashboard',
  getStaffDashboardController
);

export default router;