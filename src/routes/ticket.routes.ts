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

// FR-36 (BR-95, BR-107): sinh viên tự check-in sự kiện TRỰC TUYẾN — kích hoạt bởi thao tác
// bấm "Vào phòng họp" ở client (mở join_url đồng thời gọi endpoint này). Không nhận body.
// Quyền sở hữu vé kiểm ở service (gián tiếp qua registration.user_id).
router.post(
  '/:ticketId/self-checkin',
  requireRole('student'),
  CheckinController.selfCheckin
);

export default router;
