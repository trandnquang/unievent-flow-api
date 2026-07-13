import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { sanitizeUser, SafeUser } from '../utils/user';
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '../schemas/auth.schema';

export class AuthService {
  // Đăng ký tài khoản mới (FR-01)
  public static async register(input: RegisterInput): Promise<SafeUser> {
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await prisma.users.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'Email này đã được đăng ký trong hệ thống'
      );
    }

    // Băm mật khẩu bằng bcrypt (NFR-08)
    const passwordHash = await bcrypt.hash(input.password, 10);

    const newUser = await prisma.users.create({
      data: {
        name: input.name,
        email: input.email,
        password_hash: passwordHash,
        role: input.role,
        is_active: true,
      },
    });

    return sanitizeUser(newUser);
  }

  // Đăng nhập tài khoản (FR-02)
  public static async login(input: LoginInput): Promise<{
    accessToken: string;
    expiresIn: string;
    user: SafeUser;
  }> {
    const user = await prisma.users.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.is_active) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Email hoặc mật khẩu không chính xác'
      );
    }

    // Xác thực mật khẩu
    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.password_hash
    );
    if (!isPasswordValid) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Email hoặc mật khẩu không chính xác'
      );
    }

    // Sinh JWT token (mặc định 2 giờ = 7200s)
    const signOptions: jwt.SignOptions = {
      expiresIn: 7200,
    };
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role },
      env.JWT_SECRET,
      signOptions
    );

    return {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
      user: sanitizeUser(user),
    };
  }

  // Yêu cầu quên mật khẩu (FR-07)
  public static async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await prisma.users.findUnique({
      where: { email: input.email },
    });

    // Luôn xử lý thành công không tiết lộ email có tồn tại hay không (chống dò tài khoản)
    if (user && user.is_active) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // Hạn 15 phút

      await prisma.users.update({
        where: { id: user.id },
        data: {
          reset_token: resetToken,
          reset_token_expires: resetTokenExpires,
        },
      });

      // TODO [Tuần 3]: Gửi email chứa link/resetToken qua BullMQ worker gửi email
    }
  }

  // Đặt lại mật khẩu bằng token (FR-07)
  public static async resetPassword(input: ResetPasswordInput): Promise<void> {
    // Tra cứu user có reset_token và chưa hết hạn
    const user = await prisma.users.findFirst({
      where: {
        reset_token: input.token,
      },
    });

    if (
      !user ||
      !user.reset_token_expires ||
      user.reset_token_expires < new Date()
    ) {
      throw new AppError(
        400,
        'RESET_TOKEN_EXPIRED',
        'Token khôi phục mật khẩu không hợp lệ hoặc đã hết hạn'
      );
    }

    // Hash mật khẩu mới và xoá token khôi phục
    const passwordHash = await bcrypt.hash(input.newPassword, 10);

    await prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        reset_token: null,
        reset_token_expires: null,
      },
    });
  }

  // Đổi mật khẩu khi đã đăng nhập (FR-04)
  public static async changePassword(
    userId: string,
    input: ChangePasswordInput
  ): Promise<void> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    }

    const isOldPasswordValid = await bcrypt.compare(
      input.oldPassword,
      user.password_hash
    );

    if (!isOldPasswordValid) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Mật khẩu cũ không chính xác'
      );
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

    await prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
      },
    });
  }
}
