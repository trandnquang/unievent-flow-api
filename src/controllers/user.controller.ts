import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { FeedbackService } from '../services/feedback.service';
import { updateProfileSchema } from '../schemas/auth.schema';
import { queryMyFeedbacksSchema } from '../schemas/feedback.schema';
import { AppError } from '../utils/errors';

export class UserController {
  // Xem thông tin cá nhân (GET /users/me - FR-05)
  public static async getMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const user = await UserService.getProfile(req.user.id);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Cập nhật thông tin cá nhân (PATCH /users/me - FR-06)
  public static async updateMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const input = updateProfileSchema.parse(req.body);
      const user = await UserService.updateProfile(req.user.id, input);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Danh sách phản hồi đã gửi của chính mình (GET /users/me/feedbacks - FR-42, BR-122)
  public static async getMyFeedbacks(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const query = queryMyFeedbacksSchema.parse(req.query);
      const result = await FeedbackService.getMyFeedbacks(req.user.id, query);

      res.status(200).json({
        success: true,
        data: { feedbacks: result.feedbacks },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Hồ sơ công khai Ban tổ chức (GET /organizers/:userId - FR-33, Public)
  public static async getOrganizerProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
      if (!userId) {
        throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số userId');
      }

      const result = await UserService.getOrganizerProfile(userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
