import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import {
  CreateEventInput,
  UpdateEventInput,
  QueryEventsInput,
} from '../schemas/event.schema';

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

    return {
      event,
      ticketsRemaining,
    };
  }

  // Cập nhật sự kiện (FR-10)
  public static async updateEvent(eventId: string, input: UpdateEventInput) {
    const data: Prisma.eventsUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.cover_image !== undefined) data.cover_image = input.cover_image;
    if (input.location !== undefined) data.location = input.location;
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

    if (event.status === 'cancelled') {
      throw new AppError(
        422,
        'CANNOT_CANCEL_STARTED_EVENT',
        'Sự kiện này đã bị hủy trước đó'
      );
    }

    // Nghiệp vụ: không được hủy sự kiện đã bắt đầu
    if (new Date() >= event.start_time) {
      throw new AppError(
        422,
        'CANNOT_CANCEL_STARTED_EVENT',
        'Không thể hủy sự kiện đã bắt đầu'
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
