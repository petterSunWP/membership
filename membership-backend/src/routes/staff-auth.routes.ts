import { Router } from 'express';

import {
  loginStaffController,
} from '../controllers/staff-auth.controller.js';

const router = Router();

router.post('/login', loginStaffController);

export default router;