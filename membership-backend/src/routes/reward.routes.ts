import { Router } from 'express';
import { getRewardsController } from '../controllers/reward.controller.js';

const router = Router();

router.get('/', getRewardsController);

export default router;