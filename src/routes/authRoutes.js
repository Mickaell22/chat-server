import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  resendVerification,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/resend-verification', requireAuth, resendVerification);

export default router;
