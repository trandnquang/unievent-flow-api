import { Request, Response, NextFunction } from 'express';
import { EventService } from '../services/event.service';
import {
  createEventSchema,
  updateEventSchema,
  queryEventsSchema,
} from '../schemas/event.schema';
import { AppError } from '../utils/errors';

export class EventController {
  // Tạo sự kiện mới (POST /events - FR-08)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const input = createEventSchema.parse(req.body);
      const event = await EventService.createEvent(req.user.id, input);

      res.status(201).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }

  // Lọc, tìm kiếm & phân trang sự kiện (GET /events - FR-13)
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = queryEventsSchema.parse(req.query);
      const result = await EventService.getEvents(query);

      res.status(200).json({
        success: true,
        data: { events: result.events },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Danh sách sự kiện của organizer đang đăng nhập (GET /events/mine - FR-12)
  public static async listMine(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await EventService.getMyEvents(req.user.id, {
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data: { events: result.events },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Xem chi tiết sự kiện (GET /events/:eventId - FR-09)
  public static async getDetail(
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

      const result = await EventService.getEventById(eventId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Cập nhật sự kiện (PATCH /events/:eventId - FR-10)
  public static async update(
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

      const input = updateEventSchema.parse(req.body);
      const event = await EventService.updateEvent(eventId, input);

      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }

  // Huỷ sự kiện (POST /events/:eventId/cancel - FR-11)
  public static async cancel(
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

      const event = await EventService.cancelEvent(eventId);

      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
}
