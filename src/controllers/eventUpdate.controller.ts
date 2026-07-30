import { Request, Response, NextFunction } from 'express';
import { EventUpdateService } from '../services/eventUpdate.service';
import {
  createEventUpdateSchema,
  updateEventUpdateSchema,
  queryEventUpdatesSchema,
} from '../schemas/eventUpdate.schema';
import { AppError } from '../utils/errors';

// Lấy path param dạng chuỗi, chặn trường hợp express trả mảng
const getParam = (req: Request, name: string): string => {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new AppError(400, 'BAD_REQUEST', `Thiếu tham số ${name}`);
  }
  return value;
};

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

  // Sửa thông báo (PATCH /events/:eventId/updates/:updateId - FR-31, BR-40b)
  public static async update(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const updateId = getParam(req, 'updateId');

      const input = updateEventUpdateSchema.parse(req.body);
      const update = await EventUpdateService.updateUpdate(
        eventId,
        updateId,
        input
      );

      res.status(200).json({
        success: true,
        data: { update },
      });
    } catch (error) {
      next(error);
    }
  }

  // Xoá thông báo (DELETE /events/:eventId/updates/:updateId - FR-31, BR-40c)
  public static async remove(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const updateId = getParam(req, 'updateId');

      await EventUpdateService.deleteUpdate(eventId, updateId);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}
