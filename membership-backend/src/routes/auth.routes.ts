import { Router } from 'express';
import { register, verifyEmailController, resendVerificationCodeController,requestLoginCodeController,verifyLoginCodeController } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmailController);
router.post(
  '/resend-verification-code',
  resendVerificationCodeController
);
router.post(
  '/request-login-code',
  requestLoginCodeController
);

router.post(
  '/verify-login-code',
  verifyLoginCodeController
);

export default router;