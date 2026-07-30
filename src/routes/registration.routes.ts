import { Router } from 'express';
import { RegistrationController } from '../controllers/registration.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

// Toàn bộ router /registrations yêu cầu đăng nhập + tài khoản còn hiệu lực (API.md mục 1.4)
router.use(requireAuth, requireActive);

// FR-15/16: polling trạng thái xử lý. Owner-only theo registration.user_id (kiểm ở service),
// KHÔNG phải organizer - nên không dùng requireRole ở đây.
router.get('/:registrationId', RegistrationController.getDetail);

// FR-34 (BR-55/56): sinh viên tự huỷ đăng ký của chính mình
router.post(
  '/:registrationId/cancel',
  requireRole('student'),
  RegistrationController.cancel
);

export default router;
