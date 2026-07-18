import { Request, Response, NextFunction } from 'express';
import { EventUpdateService } from '../services/eventUpdate.service';
import {
  createEventUpdateSchema,
  queryEventUpdatesSchema,
} from '../schemas/eventUpdate.schema';
import { AppError } from '../utils/errors';

export class EventUpdateController {
  // Danh sách thông báo cập nhật (GET /events/:eventId/updates - FR-31, Public)
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawEventId = req.params.eventId;
      const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
      if (!eventId) {
        throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId');
      }

      const query = queryEventUpdatesSchema.parse(req.query);
      const result = await EventUpdateService.listUpdates(eventId, query);

      res.status(200).json({
        success: true,
        data: { updates: result.updates },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Đăng thông báo cập nhật mới (POST /events/:eventId/updates - FR-31, Organizer + Owner)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawEventId = req.params.eventId;
      const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
      if (!eventId) {
        throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId');
      }

      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const input = createEventUpdateSchema.parse(req.body);
      const update = await EventUpdateService.createUpdate(
        eventId,
        req.user.id,
        input
      );

      res.status(201).json({
        success: true,
        data: { update },
      });
    } catch (error) {
      next(error);
    }
  }
}
