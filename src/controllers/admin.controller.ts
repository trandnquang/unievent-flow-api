import { Request, Response, NextFunction } from 'express';
import { AdminService } from '../services/admin.service';
import {
  createOrganizerSchema,
  queryAdminEventsSchema,
  queryAdminUsersSchema,
  updateUserStatusSchema,
} from '../schemas/admin.schema';
import { cancelEventSchema } from '../schemas/event.schema';
import { parseOr422 } from '../utils/validation';
import { AppError } from '../utils/errors';

const getParam = (req: Request, name: string): string => {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new AppError(400, 'BAD_REQUEST', `Thiếu tham số ${name}`);
  }
  return value;
};

const requireUser = (req: Request): { id: string } => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  }
  return req.user;
};

export class AdminController {
  // Bật/tắt tài khoản (PATCH /admin/users/:userId/status - FR-29)
  public static async updateUserStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const targetUserId = getParam(req, 'userId');
      const admin = requireUser(req);

      const input = updateUserStatusSchema.parse(req.body);
      const result = await AdminService.updateUserStatus(
        targetUserId,
        admin.id,
        input.is_active
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Buộc huỷ sự kiện (POST /admin/events/:eventId/force-cancel - FR-30)
  public static async forceCancelEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const admin = requireUser(req);

      // BR-106: lý do bắt buộc 10-500 ký tự -> 422 CANCEL_REASON_REQUIRED.
      // Dùng CHUNG schema và mã lỗi với FR-11 để hai luồng huỷ nhất quán.
      const input = parseOr422(
        cancelEventSchema,
        req.body,
        'CANCEL_REASON_REQUIRED',
        'Vui lòng nhập lý do huỷ sự kiện (10-500 ký tự)'
      );

      const result = await AdminService.forceCancelEvent(
        eventId,
        admin.id,
        input.reason
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Cấp tài khoản Ban tổ chức (POST /admin/organizers - FR-38)
  public static async createOrganizer(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = createOrganizerSchema.parse(req.body);

      const result = await AdminService.createOrganizer(input);

      // 201 ngay, không đợi email gửi xong (cùng mẫu với FR-16 sinh vé)
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Tra cứu người dùng (GET /admin/users - FR-39)
  public static async listUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const admin = requireUser(req);
      const query = queryAdminUsersSchema.parse(req.query);

      const result = await AdminService.listUsers(query, admin.id);

      res.status(200).json({
        success: true,
        data: { users: result.users },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Tra cứu sự kiện (GET /admin/events - FR-39)
  public static async listEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = queryAdminEventsSchema.parse(req.query);

      const result = await AdminService.listEvents(query);

      res.status(200).json({
        success: true,
        data: { events: result.events },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
}
