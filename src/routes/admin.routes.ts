import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

// SRS CBR 4: toàn bộ nhóm /admin chỉ cần requireRole('admin') và CỐ TÌNH bỏ qua
// requireOwnerOnly/requireOwnerOrCoHost — Quản trị viên thao tác trên tài nguyên không
// thuộc sở hữu của mình là đúng mục đích (Admin Override).
router.use(requireAuth, requireActive, requireRole('admin'));

// FR-29 (BR-98/121): bật/tắt tài khoản, xoá cache active:{userId} ngay sau khi đổi
router.patch('/users/:userId/status', AdminController.updateUserStatus);

// FR-30 (BR-96/106): buộc huỷ sự kiện, lý do bắt buộc 10-500 ký tự
router.post(
  '/events/:eventId/force-cancel',
  AdminController.forceCancelEvent
);

// FR-38 (BR-82→86): con đường DUY NHẤT tạo tài khoản role=organizer
router.post('/organizers', AdminController.createOrganizer);

// FR-39 (BR-100→103, BR-110): tra cứu để FR-29/FR-30 dùng được thực tế
router.get('/users', AdminController.listUsers);
router.get('/events', AdminController.listEvents);

export default router;
