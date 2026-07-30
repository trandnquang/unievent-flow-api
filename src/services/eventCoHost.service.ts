import { $Enums } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { emailQueue } from '../config/queues';
import { AppError } from '../utils/errors';

// Bản ghi Co-host trả ra ngoài: thông tin người dùng + trạng thái lời mời (BR-46)
export interface CoHostView {
  id: string;
  name: string;
  avatar_url: string | null;
  status: $Enums.co_host_status;
  added_at: Date;
  responded_at: Date | null;
}

export class EventCoHostService {
  // Đẩy job gửi email mời (BR-46b). Lỗi hàng đợi KHÔNG được làm hỏng response —
  // bản ghi lời mời đã ghi vào CSDL, người được mời vẫn thấy ở GET /events/mine.
  private static async enqueueInvitationEmail(
    eventId: string,
    userId: string
  ): Promise<void> {
    try {
      await emailQueue.add('co_host_invitation', {
        type: 'co_host_invitation',
        event_id: eventId,
        user_id: userId,
      });
    } catch (error) {
      console.error(
        '❌ Không đẩy được job gửi email mời Co-host:',
        error instanceof Error ? error.message : error
      );
    }
  }

  // Mời Co-host (FR-37) - ownership đã được requireOwnerOnly đảm bảo.
  // BR-46 (Invitation Upsert Rule): 4 nhánh theo trạng thái bản ghi hiện có.
  // Trả kèm cờ `created` để controller chọn 201 (tạo mới) hay 200 (mời lại/lặp).
  public static async addCoHost(
    eventId: string,
    ownerId: string,
    targetUserId: string
  ): Promise<{ co_host: CoHostView; created: boolean }> {
    const user = await prisma.users.findUnique({ where: { id: targetUserId } });

    // BR-45 (Co-host Eligibility Rule): user_id phải có role=organizer đã tồn tại -
    // gộp chung 2 điều kiện (không tồn tại HOẶC không phải organizer) theo đúng câu
    // chữ BR-45, docs không tách thành 2 mã lỗi khác nhau
    if (!user || user.role !== 'organizer') {
      throw new AppError(
        422,
        'CO_HOST_NOT_ORGANIZER',
        'Người được mời làm đơn vị đồng tổ chức phải là tài khoản Ban tổ chức đã tồn tại.'
      );
    }

    // BR-45b (Self-Invite Guard Rule): chủ sự kiện không tự mời chính mình.
    // ownerId lấy từ req.user.id và requireOwnerOnly đã bảo đảm = event.organizer_id.
    if (targetUserId === ownerId) {
      throw new AppError(
        422,
        'CANNOT_INVITE_SELF',
        'Không thể tự mời chính mình làm Co-host cho sự kiện của mình.'
      );
    }

    const existing = await prisma.event_co_hosts.findUnique({
      where: {
        event_id_user_id: { event_id: eventId, user_id: targetUserId },
      },
    });

    // Nhánh (d): đã accepted -> từ chối, KHÔNG tự động đưa về pending. Tránh vô tình tước
    // quyền đang có hiệu lực của một Co-host đang hoạt động chỉ vì bấm nhầm nút mời.
    if (existing?.status === 'accepted') {
      throw new AppError(
        409,
        'CO_HOST_ALREADY_ACCEPTED',
        'Ban tổ chức này đã chấp nhận lời mời đồng tổ chức sự kiện.'
      );
    }

    let record = existing;
    let created = false;

    if (!existing) {
      // Nhánh (a): chưa có bản ghi -> tạo mới ở pending
      record = await prisma.event_co_hosts.create({
        data: { event_id: eventId, user_id: targetUserId, status: 'pending' },
      });
      created = true;
    } else if (existing.status === 'declined') {
      // Nhánh (b): đã từ chối -> đưa về pending (không giới hạn số lần mời lại).
      // Xoá responded_at vì lời mời mới chưa được phản hồi.
      record = await prisma.event_co_hosts.update({
        where: {
          event_id_user_id: { event_id: eventId, user_id: targetUserId },
        },
        data: { status: 'pending', responded_at: null },
      });
    }
    // Nhánh (c): đang pending -> thao tác lặp lại, không tạo bản ghi trùng, không đổi gì

    // BR-46b: gửi email mời ở cả 3 nhánh a/b/c (nhánh c là lựa chọn "gửi lại" mà BR-46
    // để ngỏ — chốt gửi để người được mời không bỏ lỡ lời mời đã trôi khỏi hộp thư)
    await this.enqueueInvitationEmail(eventId, targetUserId);

    return {
      co_host: {
        id: user.id,
        name: user.name,
        avatar_url: user.avatar_url,
        status: record!.status,
        added_at: record!.added_at,
        responded_at: record!.responded_at,
      },
      created,
    };
  }

  // Người được mời tự chấp nhận / từ chối (FR-37, BR-46d, UC-17b).
  // userId LUÔN lấy từ JWT (CBR 3), không nhận từ path/body — nên không cần kiểm ownership.
  public static async respondToInvitation(
    eventId: string,
    userId: string,
    status: 'accepted' | 'declined'
  ): Promise<CoHostView> {
    // Chỉ tác động bản ghi đang pending: dùng updateMany để việc lọc theo status nằm ngay
    // trong câu UPDATE, tránh khoảng hở giữa đọc và ghi khi bấm 2 nút cùng lúc.
    const result = await prisma.event_co_hosts.updateMany({
      where: { event_id: eventId, user_id: userId, status: 'pending' },
      data: { status, responded_at: new Date() },
    });

    if (result.count === 0) {
      throw new AppError(
        404,
        'CO_HOST_NOT_FOUND',
        'Không tìm thấy lời mời đồng tổ chức đang chờ bạn xác nhận'
      );
    }

    const updated = await prisma.event_co_hosts.findUniqueOrThrow({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
      include: {
        users: { select: { id: true, name: true, avatar_url: true } },
      },
    });

    // BR-46e (No Cross-Notification Rule): KHÔNG gửi thông báo ngược cho chủ sự kiện —
    // chủ sự kiện tự xem trạng thái trong danh sách Co-host của sự kiện.
    return {
      id: updated.users.id,
      name: updated.users.name,
      avatar_url: updated.users.avatar_url,
      status: updated.status,
      added_at: updated.added_at,
      responded_at: updated.responded_at,
    };
  }

  // Gỡ Co-host (FR-37, BR-44) - gỡ được bất kể status hiện tại là gì
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

  // Danh sách Co-host công khai - nhúng vào GET /events/:eventId (API.md mục 3.1).
  // CHỈ trả status='accepted': endpoint đó là public, không được lộ danh sách đang
  // pending/declined ra ngoài.
  public static async listCoHosts(
    eventId: string,
    statuses: $Enums.co_host_status[] = ['accepted']
  ) {
    const relations = await prisma.event_co_hosts.findMany({
      where: { event_id: eventId, status: { in: statuses } },
      orderBy: { added_at: 'asc' },
      include: {
        users: { select: { id: true, name: true, avatar_url: true } },
      },
    });

    return relations.map((relation) => relation.users);
  }

  // Danh sách Co-host ĐẦY ĐỦ kèm trạng thái - dành riêng cho chủ sự kiện (SRS §4.3.6b).
  // Tách khỏi listCoHosts vì đây là dữ liệu quản trị: ai đang chờ, ai đã từ chối - không
  // được lộ qua GET /events/:eventId công khai. Quyền do requireOwnerOnly đảm bảo.
  public static async listCoHostsForOwner(
    eventId: string
  ): Promise<CoHostView[]> {
    const relations = await prisma.event_co_hosts.findMany({
      where: { event_id: eventId },
      orderBy: { added_at: 'asc' },
      include: {
        users: { select: { id: true, name: true, avatar_url: true } },
      },
    });

    return relations.map((relation) => ({
      id: relation.users.id,
      name: relation.users.name,
      avatar_url: relation.users.avatar_url,
      status: relation.status,
      added_at: relation.added_at,
      responded_at: relation.responded_at,
    }));
  }
}
