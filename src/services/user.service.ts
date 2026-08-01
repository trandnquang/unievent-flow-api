import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { sanitizeUser, SafeUser } from '../utils/user';
import { UpdateProfileInput } from '../schemas/auth.schema';
import { buildPaginationMeta } from '../schemas/common.schema';
import { QueryOrganizersInput } from '../schemas/organizer.schema';

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
    // BR-17: club_name chỉ có ý nghĩa với role=organizer. Role khác gửi lên thì BỎ QUA
    // im lặng, không báo lỗi. Đọc role từ CSDL (nguồn tin cậy) thay vì tin role trong JWT.
    const currentUser = await prisma.users.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!currentUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    }

    const isOrganizer = currentUser.role === 'organizer';

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.social_links !== undefined
          ? { social_links: input.social_links }
          : {}),
        ...(isOrganizer && input.club_name !== undefined
          ? { club_name: input.club_name }
          : {}),
      },
    });

    return sanitizeUser(updatedUser);
  }

  // Tra cứu Ban tổ chức để mời làm Co-host (FR-33/37, api_spec.md mục 2 - ⭐ v1.1.0)
  //
  // ⚠️ KHÁC BIỆT CỐT LÕI với GET /admin/users (FR-39): endpoint đó trả `email` và chỉ dành
  // cho Quản trị viên. Ở đây người gọi là một Ban tổ chức bất kỳ, nên select TƯỜNG MINH đúng
  // 4 cột {id, name, club_name, avatar_url} NGAY Ở TẦNG CSDL - KHÔNG BAO GIỜ email hay bất kỳ
  // PII nào khác. Cùng nguyên tắc "select thẳng thay vì lọc sau query" đã dùng ở
  // getOrganizerProfile (BR-26): dữ liệu không được đọc lên thì không thể vô tình rò ra.
  public static async listOrganizers(query: QueryOrganizersInput) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    // Hai điều kiện CỐ ĐỊNH, không nhận từ client: chỉ Ban tổ chức, và chỉ tài khoản còn
    // hiệu lực - mời một tài khoản đã bị vô hiệu hoá theo FR-29 là mời một chỗ trống.
    const where: Prisma.usersWhereInput = { role: 'organizer', is_active: true };

    // Khớp một phần trên name HOẶC club_name, không phân biệt hoa thường (cùng cách BR-101)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { club_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [organizers, total] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: { id: true, name: true, club_name: true, avatar_url: true },
      }),
      prisma.users.count({ where }),
    ]);

    return {
      items: organizers,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Hồ sơ công khai Ban tổ chức (FR-33) - BR-26: chỉ trả nếu role=organizer, trường
  // trả về giới hạn {name, club_name, avatar_url, bio, social_links} - KHÔNG BAO GIỜ trả
  // email/password_hash, nên select thẳng ở tầng CSDL thay vì lọc sau khi query
  public static async getOrganizerProfile(userId: string) {
    const organizer = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        role: true,
        name: true,
        club_name: true,
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
        club_name: organizer.club_name,
        avatar_url: organizer.avatar_url,
        bio: organizer.bio,
        social_links: organizer.social_links,
      },
      events,
    };
  }
}
