import { Request, Response, NextFunction } from 'express';
import { EventService } from '../services/event.service';
import {
  createEventSchema,
  updateEventSchema,
  queryEventsSchema,
  queryMyEventsSchema,
  cancelEventSchema,
} from '../schemas/event.schema';
import { AppError } from '../utils/errors';
import { parseOr422 } from '../utils/validation';

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

  // Sự kiện liên quan tới organizer đang đăng nhập (GET /events/mine - FR-12, BR-38).
  // 3 nhánh: owned (có phân trang) + co_hosting + pending_invitations.
  public static async listMine(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const query = queryMyEventsSchema.parse(req.query);
      const result = await EventService.getMyEvents(req.user.id, query);

      res.status(200).json({
        success: true,
        data: {
          owned: result.owned,
          co_hosting: result.co_hosting,
          pending_invitations: result.pending_invitations,
        },
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

      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      // BR-106: lý do huỷ bắt buộc 10-500 ký tự, thiếu/ngắn -> 422 CANCEL_REASON_REQUIRED
      // (không phải 400 VALIDATION_ERROR mặc định của Zod).
      // Dùng chung parseOr422 với luồng buộc huỷ FR-30 để 2 luồng huỷ nhất quán.
      const input = parseOr422(
        cancelEventSchema,
        req.body,
        'CANCEL_REASON_REQUIRED',
        'Vui lòng nhập lý do huỷ sự kiện (10-500 ký tự)'
      );
      const event = await EventService.cancelEvent(
        eventId,
        req.user.id,
        input.reason
      );

      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  }
}
