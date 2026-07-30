import { Request, Response, NextFunction } from 'express';
import { EventCoHostService } from '../services/eventCoHost.service';
import { createEventCoHostSchema } from '../schemas/eventCoHost.schema';
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

export class EventCoHostController {
  // Danh sách Co-host kèm trạng thái (GET /events/:eventId/co-hosts - FR-37, SRS §4.3.6b).
  // Owner-only: pending/declined là dữ liệu quản trị, GET /events/:eventId công khai chỉ
  // trả accepted.
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');

      const coHosts = await EventCoHostService.listCoHostsForOwner(eventId);

      res.status(200).json({
        success: true,
        data: { co_hosts: coHosts },
      });
    } catch (error) {
      next(error);
    }
  }

  // Mời Co-host (POST /events/:eventId/co-hosts - FR-37, Organizer + Owner)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');

      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const input = createEventCoHostSchema.parse(req.body);
      const result = await EventCoHostService.addCoHost(
        eventId,
        req.user.id,
        input.user_id
      );

      // BR-46: 201 khi tạo bản ghi mới (nhánh a), 200 khi mời lại/mời lặp (nhánh b, c)
      res.status(result.created ? 201 : 200).json({
        success: true,
        data: { co_host: result.co_host },
      });
    } catch (error) {
      next(error);
    }
  }

  // Chấp nhận lời mời (PATCH /events/:eventId/co-hosts/me/accept - FR-37, BR-46d)
  public static async accept(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await EventCoHostController.respond(req, res, 'accepted');
    } catch (error) {
      next(error);
    }
  }

  // Từ chối lời mời (PATCH /events/:eventId/co-hosts/me/decline - FR-37, BR-46d)
  public static async decline(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await EventCoHostController.respond(req, res, 'declined');
    } catch (error) {
      next(error);
    }
  }

  // BR-46d: chỉ tác động bản ghi có user_id = req.user.id lấy từ JWT (CBR 3) -
  // KHÔNG nhận userId từ path/body, nên 2 endpoint này không cần requireOwnerOnly
  private static async respond(
    req: Request,
    res: Response,
    status: 'accepted' | 'declined'
  ): Promise<void> {
    const eventId = getParam(req, 'eventId');

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    }

    const coHost = await EventCoHostService.respondToInvitation(
      eventId,
      req.user.id,
      status
    );

    res.status(200).json({
      success: true,
      data: { co_host: coHost },
    });
  }

  // Gỡ Co-host (DELETE /events/:eventId/co-hosts/:userId - FR-37, Organizer + Owner)
  public static async remove(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const userId = getParam(req, 'userId');

      await EventCoHostService.removeCoHost(eventId, userId);

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}
