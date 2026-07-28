import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import {
  CreateEventScheduleInput,
  UpdateEventScheduleInput,
} from '../schemas/eventSchedule.schema';

export class EventScheduleService {
  // Danh sách mốc lịch trình, sắp theo sort_order (FR-32, BR-43)
  public static async listSchedule(eventId: string) {
    const schedule = await prisma.event_schedule.findMany({
      where: { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    return schedule;
  }

  // Thêm mốc lịch trình mới (FR-32) - quyền đã được requireOwnerOrCoHost đảm bảo
  public static async createScheduleItem(
    eventId: string,
    input: CreateEventScheduleInput
  ) {
    const scheduleItem = await prisma.event_schedule.create({
      data: {
        event_id: eventId,
        start_time: input.start_time,
        title: input.title,
        location: input.location ?? null,
        ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
      },
    });

    return scheduleItem;
  }

  // Chặn IDOR: đảm bảo scheduleId thuộc đúng eventId trong URL trước khi cho sửa/xoá
  private static async findOwnedScheduleItem(eventId: string, scheduleId: string) {
    const scheduleItem = await prisma.event_schedule.findFirst({
      where: { id: scheduleId, event_id: eventId },
    });

    if (!scheduleItem) {
      throw new AppError(
        404,
        'SCHEDULE_ITEM_NOT_FOUND',
        'Không tìm thấy mốc lịch trình thuộc sự kiện này'
      );
    }

    return scheduleItem;
  }

  // Sửa mốc lịch trình (FR-32, BR-42)
  public static async updateScheduleItem(
    eventId: string,
    scheduleId: string,
    input: UpdateEventScheduleInput
  ) {
    await this.findOwnedScheduleItem(eventId, scheduleId);

    const updatedScheduleItem = await prisma.event_schedule.update({
      where: { id: scheduleId },
      data: {
        ...(input.start_time !== undefined ? { start_time: input.start_time } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
      },
    });

    return updatedScheduleItem;
  }

  // Xoá mốc lịch trình (FR-32, BR-42)
  public static async deleteScheduleItem(eventId: string, scheduleId: string) {
    await this.findOwnedScheduleItem(eventId, scheduleId);

    await prisma.event_schedule.delete({
      where: { id: scheduleId },
    });
  }
}
