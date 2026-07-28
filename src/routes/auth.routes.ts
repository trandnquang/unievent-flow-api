import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth, requireActive } from '../middlewares/auth.middleware';
import {
  loginRateLimiter,
  registerRateLimiter,
} from '../middlewares/rateLimiter.middleware';

const router = Router();

// Các endpoint công khai (Public)
router.post('/register', registerRateLimiter, AuthController.register);
router.post('/login', loginRateLimiter, AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

// Các endpoint yêu cầu xác thực (Auth) - requireActive re-check is_active giữa phiên (API.md mục 1.4)
router.post('/logout', requireAuth, requireActive, AuthController.logout);
router.post(
  '/change-password',
  requireAuth,
  requireActive,
  AuthController.changePassword
);

export default router;
