import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { updateProfileSchema } from '../schemas/auth.schema';
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
}
