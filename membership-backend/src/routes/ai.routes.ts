import { Router } from 'express';

import {
  askAIController,
  confirmAIActionController,
  cancelAIActionController,
  getAIActionHistoryController,
} from '../controllers/ai.controller.js';

const router = Router();

router.post('/chat', askAIController);

router.get(
  '/actions',
  getAIActionHistoryController
);

router.post(
  '/actions/:id/confirm',
  confirmAIActionController
);

router.post(
  '/actions/:id/cancel',
  cancelAIActionController
);

export default router;