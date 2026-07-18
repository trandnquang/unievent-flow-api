import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { requireAuth, requireActive } from '../middlewares/auth.middleware';

const router = Router();

// Áp dụng requireAuth + requireActive (re-check is_active giữa phiên, API.md mục 1.4)
// cho toàn bộ router /users
router.use(requireAuth, requireActive);

router.get('/me', UserController.getMe);
router.patch('/me', UserController.updateMe);

export default router;
