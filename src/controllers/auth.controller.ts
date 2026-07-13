import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/auth.schema';
import { AppError } from '../utils/errors';

export class AuthController {
  // Đăng ký tài khoản (POST /auth/register - FR-01)
  public static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = registerSchema.parse(req.body);
      const user = await AuthService.register(input);

      res.status(201).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  // Đăng nhập (POST /auth/login - FR-02)
  public static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = loginSchema.parse(req.body);
      const result = await AuthService.login(input);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Đăng xuất (POST /auth/logout - FR-03)
  public static async logout(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // JWT stateless nên client xóa token là chính; trả về 204 No Content theo API.md mục 2
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

  // Quên mật khẩu (POST /auth/forgot-password - FR-07)
  public static async forgotPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = forgotPasswordSchema.parse(req.body);
      await AuthService.forgotPassword(input);

      // Trả về HTTP 202 Accepted theo API.md mục 2
      res.status(202).json({
        success: true,
        data: {
          message:
            'Yêu cầu khôi phục mật khẩu đã được tiếp nhận. Vui lòng kiểm tra email của bạn.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Đặt lại mật khẩu (POST /auth/reset-password - FR-07)
  public static async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = resetPasswordSchema.parse(req.body);
      await AuthService.resetPassword(input);

      res.status(200).json({
        success: true,
        data: {
          message: 'Đặt lại mật khẩu thành công.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Đổi mật khẩu (POST /auth/change-password - FR-04)
  public static async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
      }

      const input = changePasswordSchema.parse(req.body);
      await AuthService.changePassword(req.user.id, input);

      res.status(200).json({
        success: true,
        data: {
          message: 'Đổi mật khẩu thành công.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
