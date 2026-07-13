import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { sanitizeUser, SafeUser } from '../utils/user';
import { UpdateProfileInput } from '../schemas/auth.schema';

export class UserService {
  // Lấy thông tin cá nhân của người dùng đang đăng nhập (FR-05)
  public static async getProfile(userId: string): Promise<SafeUser> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    }

    return sanitizeUser(user);
  }

  // Cập nhật thông tin cá nhân (FR-06)
  public static async updateProfile(
    userId: string,
    input: UpdateProfileInput
  ): Promise<SafeUser> {
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        ...(input.name ? { name: input.name } : {}),
      },
    });

    return sanitizeUser(updatedUser);
  }
}
