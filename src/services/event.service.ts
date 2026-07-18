import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import {
  CreateEventInput,
  UpdateEventInput,
  QueryEventsInput,
} from '../schemas/event.schema';
import { EventScheduleService } from './eventSchedule.service';
import { EventUpdateService } from './eventUpdate.service';
import { EventCoHostService } from './eventCoHost.service';

export interface EventWithRemainingTickets {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  location: string | null;
  category: string | null;
  club_name: string | null;
  start_time: Date;
  end_time: Date;
  max_tickets: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  ticketsRemaining: number;
}

export class EventService {
  // TODO [Tuần 3]: Lấy số vé còn lại real-time từ Redis counter theo SRS §5.2.
  // Hiện tại tra cứu từ view v_event_registration_stats trong PostgreSQL làm giá trị đối soát tạm thời.
  private static async getTicketsRemainingMap(
    eventIds: string[]
  ): Promise<Record<string, number>> {
    if (eventIds.length === 0) return {};

    const stats = await prisma.$queryRaw<
      Array<{ event_id: string; tickets_remaining_db: number }>
    >`
      SELECT event_id, tickets_remaining_db
      FROM v_event_registration_stats
      WHERE event_id = ANY(${eventIds}::uuid[])
    `;

    const map: Record<string, number> = {};
    for (const row of stats) {
      map[row.event_id] = Number(row.tickets_remaining_db);
    }
    return map;
  }

  // Tạo sự kiện mới (FR-08)
  public static async createEvent(
    organizerId: string,
    input: CreateEventInput
  ) {
    const event = await prisma.events.create({
      data: {
        organizer_id: organizerId,
        title: input.title,
        description: input.description ?? null,
        cover_image: input.cover_image ?? null,
        location: input.location ?? null,
        location_type: input.location_type,
        join_url: input.join_url ?? null,
        category: input.category ?? null,
        club_name: input.club_name ?? null,
        start_time: input.start_time,
        end_time: input.end_time,
        max_tickets: input.max_tickets,
        status: 'active',
      },
    });

    // TODO [Tuần 3]: Khởi tạo key đếm vé trên Redis: SET event:{id}:tickets {max_tickets}

    return event;
  }

  // Danh sách sự kiện công khai với bộ lọc và phân trang (FR-13)
  public static async getEvents(query: QueryEventsInput): Promise<{
    events: EventWithRemainingTickets[];
    meta: {
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    };
  }> {
    const { q, category, club_name, from, to, page, limit, sort } = query;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.eventsWhereInput = {
      status: 'active',
    };

    if (q) {
      whereClause.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category) {
      whereClause.category = category;
    }

    if (club_name) {
      whereClause.club_name = club_name;
    }

    if (from || to) {
      whereClause.start_time = {};
      if (from) whereClause.start_time.gte = from;
      if (to) whereClause.start_time.lte = to;
    }

    // Xử lý sắp xếp (mặc định -created_at)
    const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
    const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';
    const validSortFields = ['created_at', 'start_time', 'title'];
    const orderBy: Prisma.eventsOrderByWithRelationInput = validSortFields.includes(
      sortField
    )
      ? { [sortField]: sortOrder }
      : { created_at: 'desc' };

    const [events, total] = await Promise.all([
      prisma.events.findMany({
        where: whereClause,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.events.count({ where: whereClause }),
    ]);

    const eventIds = events.map((e) => e.id);
    const ticketsRemainingMap = await this.getTicketsRemainingMap(eventIds);

    const eventsWithRemaining: EventWithRemainingTickets[] = events.map((e) => ({
      ...e,
      ticketsRemaining:
        ticketsRemainingMap[e.id] !== undefined
          ? ticketsRemainingMap[e.id]!
          : e.max_tickets,
    }));

    return {
      events: eventsWithRemaining,
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

  // Danh sách sự kiện do chính organizer tạo (FR-12)
  public static async getMyEvents(
    organizerId: string,
    query: { page?: number; limit?: number }
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.events.findMany({
        where: { organizer_id: organizerId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.events.count({ where: { organizer_id: organizerId } }),
    ]);

    return {
      events,
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

  // Xem chi tiết sự kiện kèm số vé còn lại (FR-09)
  public static async getEventById(eventId: string) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    const ticketsRemainingMap = await this.getTicketsRemainingMap([eventId]);
    const ticketsRemaining =
      ticketsRemainingMap[eventId] !== undefined
        ? ticketsRemainingMap[eventId]!
        : event.max_tickets;

    // API.md mục 3.1: nhúng kèm lịch trình (FR-32), 5 thông báo mới nhất (FR-31),
    // CLB/Ban tổ chức đồng hành (FR-37) - tái dùng lại service của từng nhóm, không
    // viết lại query
    const [schedule, updatesResult, coHosts] = await Promise.all([
      EventScheduleService.listSchedule(eventId),
      EventUpdateService.listUpdates(eventId, { page: 1, limit: 5 }),
      EventCoHostService.listCoHosts(eventId),
    ]);

    return {
      event,
      ticketsRemaining,
      schedule,
      updates: updatesResult.updates,
      co_hosts: coHosts,
    };
  }

  // Cập nhật sự kiện (FR-10)
  public static async updateEvent(eventId: string, input: UpdateEventInput) {
    const existingEvent = await prisma.events.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    // BR-30: partial update nên phải gộp giá trị patch với bản ghi hiện có rồi mới
    // kiểm tra ràng buộc location_type/location/join_url — tránh trường hợp chỉ đổi
    // 1 trong 2 trường liên quan làm vỡ constraint CSDL chk_event_location_fields (lỗi 500).
    const mergedLocationType = input.location_type ?? existingEvent.location_type;
    const mergedLocation =
      input.location !== undefined ? input.location : existingEvent.location;
    const mergedJoinUrl =
      input.join_url !== undefined ? input.join_url : existingEvent.join_url;

    if (
      (mergedLocationType === 'in_person' && !mergedLocation) ||
      (mergedLocationType === 'online' && !mergedJoinUrl)
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Vui lòng nhập địa điểm tổ chức (sự kiện trực tiếp) hoặc đường dẫn tham gia (sự kiện trực tuyến).'
      );
    }

    // BR-35: không cho giảm max_tickets xuống dưới số registration đã confirmed hiện tại
    if (input.max_tickets !== undefined) {
      const confirmedCount = await prisma.registrations.count({
        where: { event_id: eventId, status: 'confirmed' },
      });

      if (input.max_tickets < confirmedCount) {
        throw new AppError(
          422,
          'MAX_TICKETS_BELOW_CONFIRMED',
          'Không thể giảm số vé tối đa xuống dưới số vé đã xác nhận hiện tại.'
        );
      }
    }

    const data: Prisma.eventsUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.cover_image !== undefined) data.cover_image = input.cover_image;
    if (input.location !== undefined) data.location = input.location;
    if (input.location_type !== undefined) data.location_type = input.location_type;
    if (input.join_url !== undefined) data.join_url = input.join_url;
    if (input.category !== undefined) data.category = input.category;
    if (input.club_name !== undefined) data.club_name = input.club_name;
    if (input.start_time !== undefined) data.start_time = input.start_time;
    if (input.end_time !== undefined) data.end_time = input.end_time;
    if (input.max_tickets !== undefined) data.max_tickets = input.max_tickets;

    const updatedEvent = await prisma.events.update({
      where: { id: eventId },
      data,
    });

    return updatedEvent;
  }

  // Huỷ sự kiện - soft cancel đổi status thành cancelled (FR-11)
  public static async cancelEvent(eventId: string) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    // BR-37c (Idempotency Rule): huỷ lại sự kiện đã cancelled trước đó -> từ chối
    if (event.status === 'cancelled') {
      throw new AppError(
        409,
        'EVENT_ALREADY_CANCELLED',
        'Sự kiện này đã được huỷ trước đó.'
      );
    }

    // BR-37b (Not-Started Rule): chỉ cho huỷ khi sự kiện chưa diễn ra
    if (new Date() >= event.start_time) {
      throw new AppError(
        422,
        'EVENT_ALREADY_STARTED',
        'Sự kiện đã bắt đầu hoặc đã kết thúc, không thể huỷ.'
      );
    }

    const cancelledEvent = await prisma.events.update({
      where: { id: eventId },
      data: {
        status: 'cancelled',
      },
    });

    return cancelledEvent;
  }
}
