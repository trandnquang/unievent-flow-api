import { Prisma, events as EventRecord } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import {
  CreateEventInput,
  UpdateEventInput,
  QueryEventsInput,
  QueryMyEventsInput,
} from '../schemas/event.schema';
import { buildPaginationMeta, PaginationMeta } from '../schemas/common.schema';
import { EventScheduleService } from './eventSchedule.service';
import { EventUpdateService } from './eventUpdate.service';
import { EventCoHostService } from './eventCoHost.service';
import { TicketCounterService } from './ticketCounter.service';
import { ReminderService } from './reminder.service';

// Sự kiện kèm 2 chỉ số hiển thị công khai (API.md mục 3.1):
// - tickets_remaining: số vé còn lại
// - registered_count : số đăng ký đang chiếm chỗ, để hiển thị "X người tham gia" (BR-33b)
export type EventWithStats = EventRecord & {
  tickets_remaining: number;
  registered_count: number;
};

// Sự kiện trong nhánh co_hosting của GET /events/mine (BR-38)
export type CoHostingEvent = EventRecord & {
  my_role: 'co-host';
};

export class EventService {
  // BR-33 (Real-time Ticket Count Rule): số vé còn lại đọc TRỰC TIẾP từ bộ đếm Redis tại
  // thời điểm request, không đọc từ PostgreSQL — Redis là nơi luồng đăng ký thực sự trừ vé
  // (BR-47) và hoàn vé (BR-89/BR-56), còn view PostgreSQL chỉ là sổ cái đối soát.
  //
  // Key thiếu (sự kiện tạo trước khi có bộ đếm, hoặc Redis mất dữ liệu) -> lùi về view
  // v_event_registration_stats kèm log WARN, thay vì trả 0 làm sự kiện hiện "hết vé" oan.
  private static async getTicketsRemainingMap(
    eventIds: string[]
  ): Promise<Record<string, number>> {
    if (eventIds.length === 0) return {};

    const redisMap = await TicketCounterService.getRemainingMap(eventIds);

    const map: Record<string, number> = {};
    const missing: string[] = [];
    for (const eventId of eventIds) {
      const remaining = redisMap[eventId];
      if (remaining === null || remaining === undefined) {
        missing.push(eventId);
      } else {
        map[eventId] = remaining;
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️  [WARN] Thiếu bộ đếm vé Redis cho ${missing.length} sự kiện — tạm đọc từ view v_event_registration_stats để đối soát`
      );

      const stats = await prisma.$queryRaw<
        Array<{ event_id: string; tickets_remaining_db: number }>
      >`
        SELECT event_id, tickets_remaining_db
        FROM v_event_registration_stats
        WHERE event_id = ANY(${missing}::uuid[])
      `;

      for (const row of stats) {
        map[row.event_id] = Number(row.tickets_remaining_db);
      }
    }

    return map;
  }

  // BR-33b (Public Registered Count Rule): số đăng ký đang CHIẾM CHỖ gồm cả 'pending'
  // (đã trừ vé trên Redis nhưng worker chưa xử lý xong), không chỉ 'confirmed'.
  // Các bản ghi failed/cancelled không tính vì vé đã được hoàn về (BR-56, BR-89).
  private static async getRegisteredCountMap(
    eventIds: string[]
  ): Promise<Record<string, number>> {
    if (eventIds.length === 0) return {};

    const grouped = await prisma.registrations.groupBy({
      by: ['event_id'],
      where: {
        event_id: { in: eventIds },
        status: { in: ['confirmed', 'pending'] },
      },
      _count: { _all: true },
    });

    const map: Record<string, number> = {};
    for (const row of grouped) {
      map[row.event_id] = row._count._all;
    }
    return map;
  }

  // Gộp 2 chỉ số vào danh sách sự kiện, truy vấn 1 lần cho cả trang thay vì N+1
  private static async attachStats(
    events: EventRecord[]
  ): Promise<EventWithStats[]> {
    const eventIds = events.map((e) => e.id);
    const [ticketsRemainingMap, registeredCountMap] = await Promise.all([
      this.getTicketsRemainingMap(eventIds),
      this.getRegisteredCountMap(eventIds),
    ]);

    return events.map((event) => ({
      ...event,
      tickets_remaining:
        ticketsRemainingMap[event.id] !== undefined
          ? ticketsRemainingMap[event.id]!
          : event.max_tickets,
      registered_count: registeredCountMap[event.id] ?? 0,
    }));
  }

  // Tạo sự kiện mới (FR-08)
  public static async createEvent(
    organizerId: string,
    input: CreateEventInput
  ) {
    // BR-92 (Organizer Club Name Rule): điền sẵn club_name từ hồ sơ Ban tổ chức khi request
    // không gửi. Vẫn cho phép ghi đè từng sự kiện vì một đơn vị có thể đứng tên tổ chức hộ
    // hoặc phối hợp liên đơn vị.
    let clubName = input.club_name ?? null;
    if (input.club_name === undefined) {
      const organizer = await prisma.users.findUnique({
        where: { id: organizerId },
        select: { club_name: true },
      });
      clubName = organizer?.club_name ?? null;
    }

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
        club_name: clubName,
        start_time: input.start_time,
        end_time: input.end_time,
        max_tickets: input.max_tickets,
        status: 'active',
      },
    });

    // Khởi tạo bộ đếm vé trên Redis: vé còn lại ban đầu = max_tickets (SRS §5.2).
    // Lỗi Redis KHÔNG được huỷ sự kiện vừa ghi vào PostgreSQL — ghi log ERROR để đối soát
    // thủ công qua view v_event_registration_stats (NFR-21).
    try {
      await TicketCounterService.initTicketCounter(event.id, event.max_tickets);
    } catch (error) {
      console.error(
        `❌ [ERROR] Không khởi tạo được bộ đếm vé Redis cho sự kiện ${event.id}:`,
        error instanceof Error ? error.message : error
      );
    }

    // BR-57: lên lịch job nhắc lịch ngay khi tạo sự kiện
    await ReminderService.safeSchedule(event.id, event.start_time);

    return event;
  }

  // Danh sách sự kiện công khai với bộ lọc và phân trang (FR-13)
  public static async getEvents(query: QueryEventsInput): Promise<{
    events: EventWithStats[];
    meta: PaginationMeta;
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

    return {
      events: await this.attachStats(events),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Sự kiện liên quan tới organizer đang đăng nhập (FR-12, BR-38): 3 nhánh tách biệt.
  // Phân trang chỉ áp cho `owned`; `co_hosting` và `pending_invitations` trả đủ vì FE dùng
  // để dựng banner lời mời đang chờ ở đầu trang "Sự kiện của tôi" (SRS §4.3.3).
  public static async getMyEvents(
    userId: string,
    query: QueryMyEventsInput
  ): Promise<{
    owned: EventRecord[];
    co_hosting: CoHostingEvent[];
    pending_invitations: Array<{ event: EventRecord; invited_at: Date }>;
    meta: PaginationMeta;
  }> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [owned, total, coHostRelations, pendingRelations] = await Promise.all([
      prisma.events.findMany({
        where: { organizer_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.events.count({ where: { organizer_id: userId } }),
      prisma.event_co_hosts.findMany({
        where: { user_id: userId, status: 'accepted' },
        orderBy: { responded_at: 'desc' },
        include: { events: true },
      }),
      prisma.event_co_hosts.findMany({
        where: { user_id: userId, status: 'pending' },
        orderBy: { added_at: 'desc' },
        include: { events: true },
      }),
    ]);

    return {
      owned,
      // Co-host chỉ có đúng 1 gói quyền cố định khi accepted, không phải phân quyền tuỳ biến
      // từng cấp (API.md mục 3.4) — nên my_role là hằng số.
      co_hosting: coHostRelations.map((relation) => ({
        ...relation.events,
        my_role: 'co-host' as const,
      })),
      pending_invitations: pendingRelations.map((relation) => ({
        event: relation.events,
        invited_at: relation.added_at,
      })),
      meta: buildPaginationMeta(page, limit, total),
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

    const [withStats] = await this.attachStats([event]);

    // API.md mục 3.1: nhúng kèm lịch trình (FR-32), 5 thông báo mới nhất (FR-31),
    // Co-host (FR-37) - tái dùng lại service của từng nhóm, không viết lại query.
    // listCoHosts mặc định chỉ trả status='accepted' để không lộ pending/declined ra public.
    const [schedule, updatesResult, coHosts] = await Promise.all([
      EventScheduleService.listSchedule(eventId),
      EventUpdateService.listUpdates(eventId, { page: 1, limit: 5 }),
      EventCoHostService.listCoHosts(eventId),
    ]);

    return {
      event,
      tickets_remaining: withStats!.tickets_remaining,
      registered_count: withStats!.registered_count,
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

    // BR-35 (Max Tickets Guard Rule): đếm CẢ 'pending' — các đăng ký đang chờ worker xử lý
    // đã chiếm vé trên Redis. Nếu chỉ đếm 'confirmed' thì việc giảm max_tickets cắt mất chỗ
    // của người đang trong hàng đợi, gây oversell ngược.
    if (input.max_tickets !== undefined) {
      const occupiedCount = await prisma.registrations.count({
        where: {
          event_id: eventId,
          status: { in: ['confirmed', 'pending'] },
        },
      });

      if (input.max_tickets < occupiedCount) {
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

    // BR-90 (Ticket Counter Resync Rule): đổi max_tickets mà không đồng bộ Redis thì thay
    // đổi chỉ có tác dụng trên PostgreSQL, luồng đăng ký thực tế vẫn chạy theo hạn mức cũ.
    // Thứ tự PostgreSQL trước - Redis sau là có chủ đích: BR-90 quy định đúng tình huống
    // "PG thành công, đồng bộ Redis thất bại" thì ghi log ERROR để đối soát thủ công.
    const delta = updatedEvent.max_tickets - existingEvent.max_tickets;
    if (delta !== 0) {
      try {
        const remaining = await TicketCounterService.resyncTicketCounter(
          eventId,
          delta
        );
        if (remaining === null) {
          console.error(
            `❌ [ERROR] Bộ đếm vé Redis của sự kiện ${eventId} chưa khởi tạo hoặc sẽ bị âm khi INCRBY ${delta}`
          );
        }
      } catch (error) {
        console.error(
          `❌ [ERROR] Không đồng bộ được bộ đếm vé Redis cho sự kiện ${eventId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // BR-97(a): start_time đổi -> huỷ job nhắc lịch cũ theo jobId và lên lịch lại theo mốc mới,
    // nếu không sinh viên sẽ nhận email báo sai giờ sau khi Ban tổ chức dời lịch.
    if (
      input.start_time !== undefined &&
      updatedEvent.start_time.getTime() !== existingEvent.start_time.getTime()
    ) {
      await ReminderService.safeReschedule(eventId, updatedEvent.start_time);
    }

    return updatedEvent;
  }

  // Huỷ sự kiện - soft cancel đổi status thành cancelled (FR-11)
  public static async cancelEvent(
    eventId: string,
    cancelledBy: string,
    reason: string
  ) {
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

    // BR-37b (Not-Started Rule): chỉ cho huỷ khi sự kiện chưa diễn ra.
    // Đây là điểm KHÁC BIỆT duy nhất về guard so với FR-30 — Quản trị viên buộc huỷ
    // KHÔNG bị chặn bởi quy tắc này (BR-96a).
    if (new Date() >= event.start_time) {
      throw new AppError(
        422,
        'EVENT_ALREADY_STARTED',
        'Sự kiện đã bắt đầu hoặc đã kết thúc, không thể huỷ.'
      );
    }

    return this.applyCancellation(eventId, cancelledBy, reason);
  }

  // Hệ quả dây chuyền của việc huỷ sự kiện, DÙNG CHUNG cho FR-11 (chủ sự kiện tự huỷ) và
  // FR-30 (Quản trị viên buộc huỷ). Hai luồng chỉ khác nhau ở phần guard phía trước và ở
  // giá trị cancelled_by — phần cascade thì phải giống hệt nhau, nên tách ra một chỗ.
  public static async applyCancellation(
    eventId: string,
    cancelledBy: string,
    reason: string
  ) {
    // Toàn bộ hệ quả dây chuyền nằm trong 1 transaction: không được để sự kiện đã cancelled
    // mà vé vẫn còn valid (người tham dự tưởng vé còn dùng được).
    const cancelledEvent = await prisma.$transaction(async (tx) => {
      // BR-106 (Mandatory Audit Reason Rule): ghi vết ai huỷ, lúc nào, vì sao
      const updated = await tx.events.update({
        where: { id: eventId },
        data: {
          status: 'cancelled',
          cancel_reason: reason,
          cancelled_by: cancelledBy,
          cancelled_at: new Date(),
        },
      });

      // Cascade vé: valid -> cancelled. Vé đã checked_in GIỮ NGUYÊN vì đó là dữ liệu lịch sử
      // tham dự có thật, không được viết lại (BR-96c).
      // tickets nối events gián tiếp qua registrations nên phải lấy id đăng ký trước.
      const registrations = await tx.registrations.findMany({
        where: { event_id: eventId },
        select: { id: true },
      });

      if (registrations.length > 0) {
        await tx.tickets.updateMany({
          where: {
            registration_id: { in: registrations.map((r) => r.id) },
            status: 'valid',
          },
          data: { status: 'cancelled' },
        });
      }

      return updated;
    });

    // BR-97(b): huỷ job nhắc lịch còn treo. Đặt sau commit vì đây là tác vụ ngoài CSDL;
    // thất bại chỉ log WARN, BR-58 là lớp phòng vệ (job chạy nhầm cho tập người nhận rỗng).
    await ReminderService.safeCancel(eventId);

    // Không hoàn vé về bộ đếm Redis: sự kiện không còn nhận đăng ký, khoá đếm được bỏ qua
    // (cùng nguyên tắc BR-96 của luồng buộc huỷ FR-30).

    return cancelledEvent;
  }
}
