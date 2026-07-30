import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller';
import { CheckinController } from '../controllers/checkin.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth, requireActive);

// FR-18: chi tiết vé kèm mã QR. Owner-only theo registration.user_id (kiểm ở service) —
// không dùng requireRole vì quyền ở đây là quyền sở hữu, không phải vai trò.
router.get('/:ticketId', TicketController.getDetail);

// FR-36 (BR-95): sinh viên tự xác nhận tham dự sự kiện TRỰC TUYẾN.
// Quyền sở hữu vé kiểm ở service (gián tiếp qua registration.user_id).
router.post(
  '/:ticketId/self-checkin',
  requireRole('student'),
  CheckinController.selfCheckin
);

export default router;
