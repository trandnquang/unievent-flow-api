import { prisma } from '../config/db';
import { emailQueue } from '../config/queues';
import { AppError } from '../utils/errors';
import {
  CreateEventUpdateInput,
  UpdateEventUpdateInput,
  QueryEventUpdatesInput,
} from '../schemas/eventUpdate.schema';
import { buildPaginationMeta } from '../schemas/common.schema';

export class EventUpdateService {
  // Chặn IDOR: updateId phải thuộc đúng eventId trên đường dẫn, khác -> 404 (BR-40b/40c).
  // Cùng khuôn với findOwnedScheduleItem của FR-32.
  private static async findUpdateInEvent(eventId: string, updateId: string) {
    const update = await prisma.event_updates.findFirst({
      where: { id: updateId, event_id: eventId },
    });

    if (!update) {
      throw new AppError(
        404,
        'UPDATE_NOT_FOUND',
        'Không tìm thấy thông báo này trong sự kiện'
      );
    }

    return update;
  }

  // Danh sách thông báo cập nhật của sự kiện, mới nhất trước (FR-31, BR-41)
  public static async listUpdates(
    eventId: string,
    query: QueryEventUpdatesInput
  ) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [updates, total] = await Promise.all([
      prisma.event_updates.findMany({
        where: { event_id: eventId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.event_updates.count({ where: { event_id: eventId } }),
    ]);

    return {
      updates,
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Đăng thông báo cập nhật mới (FR-31) - BR-40 quyền đã được requireOwnerOrCoHost đảm bảo
  public static async createUpdate(
    eventId: string,
    organizerId: string,
    input: CreateEventUpdateInput
  ) {
    const update = await prisma.event_updates.create({
      data: {
        event_id: eventId,
        organizer_id: organizerId,
        title: input.title,
        content: input.content,
      },
    });

    // FR-31: đẩy job gửi email cho toàn bộ người đăng ký status=confirmed. Worker tự truy vấn
    // danh sách người nhận lúc chạy (SRS mục 5.6). Lỗi hàng đợi KHÔNG được làm hỏng 201 —
    // thông báo đã nằm trong feed sự kiện, email chỉ là kênh phụ.
    try {
      await emailQueue.add('event_update', {
        type: 'event_update',
        event_id: eventId,
        update_id: update.id,
      });
    } catch (error) {
      console.error(
        '❌ Không đẩy được job gửi email thông báo sự kiện:',
        error instanceof Error ? error.message : error
      );
    }

    return update;
  }

  // Sửa thông báo đã đăng (FR-31, BR-40b).
  // KHÔNG gửi lại email: email đã phát ở lần đăng đầu không thu hồi/không đồng bộ được —
  // giới hạn có chủ đích, giao diện phải nêu rõ điều này khi người dùng bấm Sửa.
  public static async updateUpdate(
    eventId: string,
    updateId: string,
    input: UpdateEventUpdateInput
  ) {
    await this.findUpdateInEvent(eventId, updateId);

    return prisma.event_updates.update({
      where: { id: updateId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
      },
    });
  }

  // Xoá thông báo khỏi feed (FR-31, BR-40c).
  // Email đã gửi trước đó không thu hồi được; xoá chỉ gỡ khỏi danh sách hiển thị.
  public static async deleteUpdate(
    eventId: string,
    updateId: string
  ): Promise<void> {
    await this.findUpdateInEvent(eventId, updateId);

    await prisma.event_updates.delete({ where: { id: updateId } });
  }
}
