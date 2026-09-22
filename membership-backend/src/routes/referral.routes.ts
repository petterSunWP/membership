import { Router } from 'express';
import { getUserReferrals } from '../controllers/referral.controller.js';

const router = Router();

router.get('/:userId', getUserReferrals);

export default router;