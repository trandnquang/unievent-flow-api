import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { EventUpdateController } from '../controllers/eventUpdate.controller';
import { EventScheduleController } from '../controllers/eventSchedule.controller';
import { EventCoHostController } from '../controllers/eventCoHost.controller';
import { RegistrationController } from '../controllers/registration.controller';
import { CheckinController } from '../controllers/checkin.controller';
import { FeedbackController } from '../controllers/feedback.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
  requireOwnerOnly,
  requireOwnerOrCoHost,
} from '../middlewares/auth.middleware';
import {
  coHostInviteRateLimiter,
  checkinScanRateLimiter,
} from '../middlewares/rateLimiter.middleware';

const router = Router();

// 1. Các endpoint danh sách chung (Public hoặc riêng Organizer)
router.get('/', EventController.list);

// LƯU Ý: Đặt /mine trước /:eventId để tránh xung đột route param express
// requireActive re-check is_active giữa phiên (API.md mục 1.4)
router.get(
  '/mine',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  EventController.listMine
);

router.post(
  '/',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  EventController.create
);

// 2. Các endpoint theo từng id cụ thể (/:eventId)
router.get('/:eventId', EventController.getDetail);

router.patch(
  '/:eventId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  EventController.update
);

router.post(
  '/:eventId/cancel',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  EventController.cancel
);

// 3. Đăng ký tham dự (FR-14) - chỉ Sinh viên (BR-87a)
router.post(
  '/:eventId/registrations',
  requireAuth,
  requireActive,
  requireRole('student'),
  RegistrationController.create
);

// FR-41 (BR-113/114): danh sách người đăng ký - Owner hoặc Co-host đã accepted.
// ⚠️ Trả email (PII) nên tuyệt đối không nới quyền xuống public.
router.get(
  '/:eventId/registrations',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  RegistrationController.listByEvent
);

// 4. Check-in tại cổng (FR-19→22)
// LƯU Ý: đường dẫn có :eventId (khác API.md v0.4.8 ghi `/checkin/scan`) vì cả
// requireOwnerOrCoHost lẫn bước so khớp event_mismatch (BR-59) đều cần eventId.
router.post(
  '/:eventId/checkin/scan',
  requireAuth,
  requireActive,
  checkinScanRateLimiter,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  CheckinController.scan
);

router.get(
  '/:eventId/checkins',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  CheckinController.list
);

router.get(
  '/:eventId/checkins/export',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  CheckinController.exportCsv
);

// 5. Phản hồi & phân tích cảm xúc (FR-23→26, FR-28)
// Gửi phản hồi: Sinh viên (BR-67 kiểm điều kiện đã tham dự ở tầng service)
router.post(
  '/:eventId/feedbacks',
  requireAuth,
  requireActive,
  requireRole('student'),
  FeedbackController.create
);

// BR-71: 3 endpoint còn lại chỉ dành cho CHỦ sự kiện (không uỷ quyền cho Co-host)
router.get(
  '/:eventId/feedbacks',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  FeedbackController.list
);

router.post(
  '/:eventId/feedbacks/analyze',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  FeedbackController.analyze
);

router.get(
  '/:eventId/feedbacks/summary',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  FeedbackController.summary
);

// 6. Dashboard sự kiện (FR-27/28)
router.get(
  '/:eventId/dashboard',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  DashboardController.getEventDashboard
);

// 7. Thông báo cập nhật sự kiện (FR-31)
router.get('/:eventId/updates', EventUpdateController.list);

router.post(
  '/:eventId/updates',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventUpdateController.create
);

// BR-40b: sửa thông báo - KHÔNG gửi lại email cho người đăng ký
router.patch(
  '/:eventId/updates/:updateId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventUpdateController.update
);

// BR-40c: xoá thông báo khỏi feed - email đã gửi không thu hồi được
router.delete(
  '/:eventId/updates/:updateId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventUpdateController.remove
);

// 8. Lịch trình sự kiện (FR-32)
router.get('/:eventId/schedule', EventScheduleController.list);

router.post(
  '/:eventId/schedule',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventScheduleController.create
);

router.patch(
  '/:eventId/schedule/:scheduleId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventScheduleController.update
);

router.delete(
  '/:eventId/schedule/:scheduleId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOrCoHost,
  EventScheduleController.remove
);

// 9. Co-host (FR-37)
// Danh sách đầy đủ kèm trạng thái - owner-only (SRS §4.3.6b). GET /events/:eventId công khai
// chỉ trả accepted, không lộ pending/declined.
router.get(
  '/:eventId/co-hosts',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  EventCoHostController.list
);

// API.md mục 1.6: rate-limit 10 lần/giờ/user, đặt SAU requireAuth để đếm theo tài khoản
router.post(
  '/:eventId/co-hosts',
  requireAuth,
  requireActive,
  coHostInviteRateLimiter,
  requireRole('organizer'),
  requireOwnerOnly,
  EventCoHostController.create
);

// BR-46d: người ĐƯỢC MỜI tự xác nhận - chỉ tác động bản ghi của chính req.user.id nên
// KHÔNG dùng requireOwnerOnly (không phải chủ sự kiện) và cũng không dùng
// requireOwnerOrCoHost (middleware đó chỉ cho qua khi ĐÃ accepted, sẽ khoá chính luồng này)
router.patch(
  '/:eventId/co-hosts/me/accept',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  EventCoHostController.accept
);

router.patch(
  '/:eventId/co-hosts/me/decline',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  EventCoHostController.decline
);

router.delete(
  '/:eventId/co-hosts/:userId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnerOnly,
  EventCoHostController.remove
);

export default router;
