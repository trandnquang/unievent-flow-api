import { Request, Response, NextFunction } from 'express';
import { EventCoHostService } from '../services/eventCoHost.service';
import { createEventCoHostSchema } from '../schemas/eventCoHost.schema';
import { AppError } from '../utils/errors';

export class EventCoHostController {
  // Gắn CLB/Ban tổ chức đồng hành (POST /events/:eventId/co-hosts - FR-37, Organizer + Owner)
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

      const input = createEventCoHostSchema.parse(req.body);
      const coHost = await EventCoHostService.addCoHost(eventId, input.user_id);

      res.status(201).json({
        success: true,
        data: { co_host: coHost },
      });
    } catch (error) {
      next(error);
    }
  }

  // Gỡ CLB/Ban tổ chức đồng hành (DELETE /events/:eventId/co-hosts/:userId - FR-37, Organizer + Owner)
  public static async remove(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawEventId = req.params.eventId;
      const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
      if (!eventId || !userId) {
        throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId/userId');
      }

      await EventCoHostService.removeCoHost(eventId, userId);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}
