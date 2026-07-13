import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import {
  requireAuth,
  requireRole,
  requireOwnership,
} from '../middlewares/auth.middleware';

const router = Router();

// 1. Các endpoint danh sách chung (Public hoặc riêng Organizer)
router.get('/', EventController.list);

// LƯU Ý: Đặt /mine trước /:eventId để tránh xung đột route param express
router.get(
  '/mine',
  requireAuth,
  requireRole('organizer'),
  EventController.listMine
);

router.post(
  '/',
  requireAuth,
  requireRole('organizer'),
  EventController.create
);

// 2. Các endpoint theo từng id cụ thể (/:eventId)
router.get('/:eventId', EventController.getDetail);

router.patch(
  '/:eventId',
  requireAuth,
  requireRole('organizer'),
  requireOwnership,
  EventController.update
);

router.post(
  '/:eventId/cancel',
  requireAuth,
  requireRole('organizer'),
  requireOwnership,
  EventController.cancel
);

export default router;
