import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { AppError } from '../utils/errors';

export class DashboardController {
  // Dashboard sự kiện (GET /events/:eventId/dashboard - FR-27/28, Owner)
  public static async getEventDashboard(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const raw = req.params.eventId;
      const eventId = Array.isArray(raw) ? raw[0] : raw;
      if (!eventId) {
        throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId');
      }

      const dashboard = await DashboardService.getEventDashboard(eventId);

      res.status(200).json({
        success: true,
        data: dashboard,
      });
    } catch (error) {
      next(error);
    }
  }
}
