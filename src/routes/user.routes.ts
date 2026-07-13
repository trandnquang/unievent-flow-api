import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

// Áp dụng middleware requireAuth cho toàn bộ router /users
router.use(requireAuth);

router.get('/me', UserController.getMe);
router.patch('/me', UserController.updateMe);

export default router;
