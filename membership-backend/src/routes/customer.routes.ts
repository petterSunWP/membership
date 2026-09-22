import { Router } from 'express';
import { getCustomerProfileController, getReferralLinkController,getCurrentCustomerController } from '../controllers/customer.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/profile', getCustomerProfileController);
router.get(
  '/:userId/referral-link',
  getReferralLinkController
);
router.get(
  '/me',
  requireAuth,
  getCurrentCustomerController
);

export default router;