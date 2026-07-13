import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { loginRateLimiter } from '../middlewares/rateLimiter.middleware';

const router = Router();

// Các endpoint công khai (Public)
router.post('/register', AuthController.register);
router.post('/login', loginRateLimiter, AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

// Các endpoint yêu cầu xác thực (Auth)
router.post('/logout', requireAuth, AuthController.logout);
router.post('/change-password', requireAuth, AuthController.changePassword);

export default router;
