import { Request, Response, NextFunction } from 'express';
import { EventScheduleService } from '../services/eventSchedule.service';
import {
  createEventScheduleSchema,
  updateEventScheduleSchema,
} from '../schemas/eventSchedule.schema';
import { AppError } from '../utils/errors';

// Lấy eventId/scheduleId từ params, xử lý trường hợp Express trả về mảng
function getParam(
  req: Request,
  name: string,
  errorMessage: string
): string {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new AppError(400, 'BAD_REQUEST', errorMessage);
  }
  return value;
}

export class EventScheduleController {
  // Danh sách lịch trình (GET /events/:eventId/schedule - FR-32, Public)
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId', 'Thiếu tham số eventId');
      const schedule = await EventScheduleService.listSchedule(eventId);

      res.status(200).json({
        success: true,
        data: { schedule },
      });
    } catch (error) {
      next(error);
    }
  }

  // Thêm mốc lịch trình (POST /events/:eventId/schedule - FR-32, Organizer + Owner)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId', 'Thiếu tham số eventId');
      const input = createEventScheduleSchema.parse(req.body);
      const scheduleItem = await EventScheduleService.createScheduleItem(
        eventId,
        input
      );

      res.status(201).json({
        success: true,
        data: { schedule_item: scheduleItem },
      });
    } catch (error) {
      next(error);
    }
  }

  // Sửa mốc lịch trình (PATCH /events/:eventId/schedule/:scheduleId - FR-32, Organizer + Owner)
  public static async update(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId', 'Thiếu tham số eventId');
      const scheduleId = getParam(req, 'scheduleId', 'Thiếu tham số scheduleId');
      const input = updateEventScheduleSchema.parse(req.body);
      const scheduleItem = await EventScheduleService.updateScheduleItem(
        eventId,
        scheduleId,
        input
      );

      res.status(200).json({
        success: true,
        data: { schedule_item: scheduleItem },
      });
    } catch (error) {
      next(error);
    }
  }

  // Xoá mốc lịch trình (DELETE /events/:eventId/schedule/:scheduleId - FR-32, Organizer + Owner)
  public static async remove(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId', 'Thiếu tham số eventId');
      const scheduleId = getParam(req, 'scheduleId', 'Thiếu tham số scheduleId');
      await EventScheduleService.deleteScheduleItem(eventId, scheduleId);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}
