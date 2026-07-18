import { prisma } from '../config/db';
import {
  CreateEventUpdateInput,
  QueryEventUpdatesInput,
} from '../schemas/eventUpdate.schema';

export class EventUpdateService {
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
      meta: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  // Đăng thông báo cập nhật mới (FR-31) - BR-40 ownership đã được requireOwnership đảm bảo
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

    return update;
  }
}
