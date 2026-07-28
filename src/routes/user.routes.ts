import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

// Áp dụng requireAuth + requireActive (re-check is_active giữa phiên, API.md mục 1.4)
// cho toàn bộ router /users
router.use(requireAuth, requireActive);

router.get('/me', UserController.getMe);
router.patch('/me', UserController.updateMe);

// FR-42 (BR-122): màn "Phản hồi đã gửi" của Sinh viên - API.md mục 4 ghi rõ quyền Student
router.get(
  '/me/feedbacks',
  requireRole('student'),
  UserController.getMyFeedbacks
);

export default router;
