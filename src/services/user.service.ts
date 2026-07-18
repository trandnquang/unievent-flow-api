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

  // Cập nhật thông tin cá nhân (FR-06) - BR-16→19: chỉ ghi đè field được gửi lên,
  // KHÔNG cho sửa email/role/password qua endpoint này
  public static async updateProfile(
    userId: string,
    input: UpdateProfileInput
  ): Promise<SafeUser> {
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.social_links !== undefined
          ? { social_links: input.social_links }
          : {}),
      },
    });

    return sanitizeUser(updatedUser);
  }

  // Hồ sơ công khai Ban tổ chức (FR-33) - BR-26: chỉ trả nếu role=organizer, trường
  // trả về giới hạn {name, avatar_url, bio, social_links} - KHÔNG BAO GIỜ trả
  // email/password_hash, nên select thẳng ở tầng CSDL thay vì lọc sau khi query
  public static async getOrganizerProfile(userId: string) {
    const organizer = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        role: true,
        name: true,
        avatar_url: true,
        bio: true,
        social_links: true,
      },
    });

    if (!organizer || organizer.role !== 'organizer') {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy Ban tổ chức');
    }

    // BR-27: chỉ hiển thị sự kiện đang active của organizer này (không phân trang - API.md không yêu cầu)
    const events = await prisma.events.findMany({
      where: { organizer_id: userId, status: 'active' },
      orderBy: { start_time: 'asc' },
    });

    return {
      organizer: {
        name: organizer.name,
        avatar_url: organizer.avatar_url,
        bio: organizer.bio,
        social_links: organizer.social_links,
      },
      events,
    };
  }
}
