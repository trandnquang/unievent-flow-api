import { Request, Response, NextFunction } from 'express';
import { RegistrationService } from '../services/registration.service';
import { queryEventRegistrationsSchema } from '../schemas/registration.schema';
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

const requireUser = (req: Request): { id: string } => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  }
  return req.user;
};

export class RegistrationController {
  // Đăng ký tham dự (POST /events/:eventId/registrations - FR-14, Student)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const user = requireUser(req);

      // API.md mục 1.7: header tuỳ chọn, không gửi thì bỏ qua cơ chế chống trùng
      const rawKey = req.get('Idempotency-Key');
      const idempotencyKey = rawKey?.trim() || undefined;

      const result = await RegistrationService.createRegistration(
        user.id,
        eventId,
        idempotencyKey
      );

      // BR-50: 202 Accepted - worker xử lý bất đồng bộ, client poll GET /registrations/:id
      res.status(202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Danh sách người đăng ký của sự kiện
  // (GET /events/:eventId/registrations - FR-41, Owner-or-CoHost)
  public static async listByEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const query = queryEventRegistrationsSchema.parse(req.query);

      const result = await RegistrationService.listEventRegistrations(
        eventId,
        query
      );

      res.status(200).json({
        success: true,
        data: { items: result.items },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Xem trạng thái xử lý đăng ký (GET /registrations/:registrationId - FR-15/16, Owner)
  public static async getDetail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const registrationId = getParam(req, 'registrationId');
      const user = requireUser(req);

      const result = await RegistrationService.getRegistrationForUser(
        registrationId,
        user.id
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Tự huỷ đăng ký (POST /registrations/:registrationId/cancel - FR-34, Student + Owner)
  public static async cancel(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const registrationId = getParam(req, 'registrationId');
      const user = requireUser(req);

      const result = await RegistrationService.cancelRegistration(
        registrationId,
        user.id
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
