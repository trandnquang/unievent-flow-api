import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

export class EventCoHostService {
  // Gắn CLB/Ban tổ chức đồng hành (FR-37) - ownership đã được requireOwnership đảm bảo
  public static async addCoHost(eventId: string, userId: string) {
    const user = await prisma.users.findUnique({ where: { id: userId } });

    // BR-45 (Co-host Eligibility Rule): user_id phải có role=organizer đã tồn tại -
    // gộp chung 2 điều kiện (không tồn tại HOẶC không phải organizer) theo đúng câu
    // chữ BR-45, docs không tách thành 2 mã lỗi khác nhau
    if (!user || user.role !== 'organizer') {
      throw new AppError(
        422,
        'CO_HOST_NOT_ORGANIZER',
        'Người được gắn làm CLB/Ban tổ chức đồng hành phải là tài khoản Ban tổ chức đã tồn tại.'
      );
    }

    const existing = await prisma.event_co_hosts.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    });

    if (existing) {
      throw new AppError(
        409,
        'CO_HOST_ALREADY_EXISTS',
        'Ban tổ chức này đã được gắn làm đồng hành cho sự kiện.'
      );
    }

    // BR-46 (No-Privilege Rule): chỉ lưu quan hệ hiển thị, không có cột quyền hạn
    await prisma.event_co_hosts.create({
      data: { event_id: eventId, user_id: userId },
    });

    return {
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
    };
  }

  // Gỡ CLB/Ban tổ chức đồng hành (FR-37)
  public static async removeCoHost(eventId: string, userId: string) {
    const existing = await prisma.event_co_hosts.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    });

    if (!existing) {
      throw new AppError(
        404,
        'CO_HOST_NOT_FOUND',
        'Không tìm thấy CLB/Ban tổ chức đồng hành này trong sự kiện'
      );
    }

    await prisma.event_co_hosts.delete({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    });
  }

  // Danh sách CLB/Ban tổ chức đồng hành - dùng để nhúng vào GET /events/:eventId (API.md mục 3.1)
  public static async listCoHosts(eventId: string) {
    const relations = await prisma.event_co_hosts.findMany({
      where: { event_id: eventId },
      orderBy: { added_at: 'asc' },
      include: {
        users: { select: { id: true, name: true, avatar_url: true } },
      },
    });

    return relations.map((relation) => relation.users);
  }
}
