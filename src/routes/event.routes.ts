import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { EventUpdateController } from '../controllers/eventUpdate.controller';
import { EventScheduleController } from '../controllers/eventSchedule.controller';
import { EventCoHostController } from '../controllers/eventCoHost.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
  requireOwnership,
} from '../middlewares/auth.middleware';

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
  requireOwnership,
  EventController.update
);

router.post(
  '/:eventId/cancel',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventController.cancel
);

// 3. Thông báo cập nhật sự kiện (FR-31)
router.get('/:eventId/updates', EventUpdateController.list);

router.post(
  '/:eventId/updates',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventUpdateController.create
);

// 4. Lịch trình sự kiện (FR-32)
router.get('/:eventId/schedule', EventScheduleController.list);

router.post(
  '/:eventId/schedule',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventScheduleController.create
);

router.patch(
  '/:eventId/schedule/:scheduleId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventScheduleController.update
);

router.delete(
  '/:eventId/schedule/:scheduleId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventScheduleController.remove
);

// 5. CLB/Ban tổ chức đồng hành (FR-37)
router.post(
  '/:eventId/co-hosts',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventCoHostController.create
);

router.delete(
  '/:eventId/co-hosts/:userId',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  requireOwnership,
  EventCoHostController.remove
);

export default router;
