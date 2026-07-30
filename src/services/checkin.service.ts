import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { checkinQueue } from '../config/queues';
import { AppError } from '../utils/errors';
import { buildPaginationMeta, PaginationInput } from '../schemas/common.schema';
import { buildCsv } from '../utils/csv';

// BR-91: khoá nguyên tử chốt "vé này đã được dùng" ngay trong luồng đồng bộ, trước khi
// bản ghi lịch sử kịp được ghi bất đồng bộ.
export const checkinLockKey = (ticketId: string): string =>
  `checkin:${ticketId}`;

// Các giá trị `result` theo API.md mục 5. HTTP luôn 200 — request kỹ thuật là hợp lệ,
// chỉ nội dung vé mới sai; trả `result` giúp giao diện cổng hiển thị đúng loại lỗi.
export type CheckinResult =
  | 'valid'
  | 'already_checked_in'
  | 'invalid_signature'
  | 'event_mismatch'
  | 'cancelled_ticket'
  | 'expired_ticket';

export interface ScanOutcome {
  result: CheckinResult;
  attendee?: { name: string; event_title: string };
  checked_in_at?: Date;
}

interface TicketTokenPayload {
  registration_id: string;
  event_id: string;
  ticket_id: string;
}

export class CheckinService {
  // Quét vé tại cổng (FR-19/20). Thứ tự các bước bám đúng sơ đồ SRS mục 2.2.4 —
  // không đảo, vì mỗi bước sau chỉ an toàn khi bước trước đã chốt.
  public static async scan(
    eventId: string,
    organizerId: string,
    qrToken: string
  ): Promise<ScanOutcome> {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, location_type: true },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    // BR-60: luồng quét QR chỉ áp dụng cho sự kiện trực tiếp. Sự kiện trực tuyến dùng
    // FR-36 (sinh viên tự xác nhận tham dự). Đây là lỗi HTTP thật, không phải `result`.
    if (event.location_type !== 'in_person') {
      throw new AppError(
        422,
        'EVENT_NOT_ONLINE',
        'Sự kiện trực tuyến không dùng luồng quét QR tại cổng.'
      );
    }

    // BR-59 + BR-99: xác thực chữ ký và hạn dùng, KHÔNG chạm cơ sở dữ liệu ở bước này
    let payload: TicketTokenPayload;
    try {
      payload = jwt.verify(qrToken, env.TICKET_JWT_SECRET) as TicketTokenPayload;
    } catch (error) {
      // Phân biệt vé hết hạn với vé giả: hết hạn là vé thật, chỉ quá muộn (MSG-45)
      if (error instanceof jwt.TokenExpiredError) {
        return { result: 'expired_ticket' };
      }
      return { result: 'invalid_signature' };
    }

    // Vé thật nhưng của sự kiện khác - thường gặp khi một cổng phục vụ nhiều sự kiện
    if (payload.event_id !== eventId) {
      return { result: 'event_mismatch' };
    }

    // BR-91 (Atomic Check-in Guard Rule): đúng MỘT lệnh Redis chốt kết quả. Hai máy quét
    // bấm cùng lúc thì chỉ một cái đặt được khoá — cái còn lại nhận already_checked_in.
    // Đặt khoá TRƯỚC khi đọc CSDL vì đây mới là bước quyết định tính đúng đắn.
    const lockAcquired = await redis.set(
      checkinLockKey(payload.ticket_id),
      organizerId,
      'EX',
      env.CHECKIN_LOCK_TTL_SECONDS,
      'NX'
    );

    if (lockAcquired === null) {
      return this.buildAlreadyCheckedIn(payload.ticket_id, event.title);
    }

    // BR-109: trạng thái vé luôn tra từ bảng tickets, chữ ký JWT chỉ chứng minh toàn vẹn.
    // Đúng 1 truy vấn theo khoá chính để giữ ràng buộc <1s của NFR-01.
    const ticket = await prisma.tickets.findUnique({
      where: { id: payload.ticket_id },
      select: {
        id: true,
        status: true,
        registrations: { select: { users: { select: { name: true } } } },
      },
    });

    if (!ticket) {
      // Vé ký hợp lệ nhưng không còn trong sổ cái — coi như vé giả, và nhả khoá vừa đặt
      await redis.del(checkinLockKey(payload.ticket_id));
      return { result: 'invalid_signature' };
    }

    const attendee = {
      name: ticket.registrations.users.name,
      event_title: event.title,
    };

    if (ticket.status === 'cancelled') {
      // Nhả khoá: vé bị huỷ không phải "đã dùng", giữ khoá sẽ che mất lần quét sau
      await redis.del(checkinLockKey(payload.ticket_id));
      return { result: 'cancelled_ticket', attendee };
    }

    // BR-61: lớp phòng vệ thứ hai cho trường hợp khoá Redis đã hết hạn hoặc bị mất
    // (Redis khởi động lại, eviction) mà vé thì đã check-in từ trước.
    if (ticket.status === 'checked_in') {
      return this.buildAlreadyCheckedIn(ticket.id, event.title, attendee.name);
    }

    // BR-62: đẩy job ghi lịch sử rồi trả kết quả NGAY, không đợi ghi xong.
    // An toàn vì tính đúng đắn của kết quả đã được chốt bằng khoá Redis ở trên.
    await checkinQueue.add('write', {
      ticket_id: ticket.id,
      event_id: eventId,
      organizer_id: organizerId,
    });

    return { result: 'valid', attendee };
  }

  // Dựng phản hồi already_checked_in kèm thời điểm check-in gốc (API.md v0.4.5) để màn
  // "ĐÃ CHECK-IN" ở cổng hiển thị đúng lần vào đầu tiên, phục vụ xử lý tranh chấp.
  private static async buildAlreadyCheckedIn(
    ticketId: string,
    eventTitle: string,
    knownName?: string
  ): Promise<ScanOutcome> {
    const log = await prisma.checkin_logs.findUnique({
      where: { ticket_id: ticketId },
      select: {
        checkin_time: true,
        tickets: {
          select: {
            registrations: { select: { users: { select: { name: true } } } },
          },
        },
      },
    });

    const name = knownName ?? log?.tickets.registrations.users.name ?? '';

    return {
      result: 'already_checked_in',
      attendee: { name, event_title: eventTitle },
      // Khoá đã đặt nhưng job ghi log chưa chạy xong -> chưa có checkin_time để trả
      ...(log ? { checked_in_at: log.checkin_time } : {}),
    };
  }

  // Sinh viên tự xác nhận tham dự sự kiện trực tuyến (FR-36).
  // Luồng ĐỒNG BỘ: không có ràng buộc <1s như BR-60 nên ghi thẳng, không qua hàng đợi.
  public static async selfCheckin(ticketId: string, userId: string) {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        registrations: {
          select: {
            user_id: true,
            events: {
              select: {
                id: true,
                status: true,
                location_type: true,
                start_time: true,
                end_time: true,
              },
            },
          },
        },
      },
    });

    if (!ticket || ticket.registrations.user_id !== userId) {
      throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy vé này');
    }

    const event = ticket.registrations.events;

    if (event.location_type !== 'online') {
      throw new AppError(
        422,
        'EVENT_NOT_ONLINE',
        'Chức năng này chỉ dành cho sự kiện trực tuyến.'
      );
    }

    // BR-95 (Self Check-in Time Window Rule): sự kiện còn hiệu lực VÀ đang trong khung
    // [start_time − 15 phút, end_time + 30 phút]. Biên trước cho phép vào phòng sớm,
    // biên sau cho phép xác nhận bù khi sự kiện kéo dài quá giờ.
    const now = new Date();
    const opensAt = new Date(event.start_time.getTime() - 15 * 60 * 1000);
    const closesAt = new Date(event.end_time.getTime() + 30 * 60 * 1000);

    if (event.status !== 'active' || now < opensAt || now > closesAt) {
      throw new AppError(
        422,
        'SELF_CHECKIN_WINDOW_CLOSED',
        'Chức năng xác nhận tham dự chỉ mở từ 15 phút trước khi sự kiện bắt đầu đến 30 phút sau khi kết thúc.'
      );
    }

    if (ticket.status === 'checked_in') {
      throw new AppError(
        409,
        'ALREADY_CHECKED_IN',
        'Bạn đã xác nhận tham dự sự kiện này rồi.'
      );
    }

    if (ticket.status !== 'valid') {
      throw new AppError(
        422,
        'TICKET_NOT_VALID',
        'Vé này không còn hiệu lực để xác nhận tham dự.'
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Điều kiện status='valid' nằm trong câu UPDATE để hai lần bấm đồng thời không
      // cùng đi tới bước ghi log (cùng nguyên tắc với BR-93 ở luồng đăng ký).
      const changed = await tx.tickets.updateMany({
        where: { id: ticketId, status: 'valid' },
        data: { status: 'checked_in' },
      });

      if (changed.count === 0) {
        throw new AppError(
          409,
          'ALREADY_CHECKED_IN',
          'Bạn đã xác nhận tham dự sự kiện này rồi.'
        );
      }

      // CHECK constraint chk_checkin_method_organizer (chỉ tồn tại ở SQL, Prisma KHÔNG
      // biểu diễn): checkin_method='self' BUỘC phải đi kèm organizer_id = NULL.
      await tx.checkin_logs.create({
        data: {
          ticket_id: ticketId,
          organizer_id: null,
          checkin_method: 'self',
        },
      });

      return tx.tickets.findUniqueOrThrow({ where: { id: ticketId } });
    });

    return { ticket: updated };
  }

  // Lịch sử check-in của sự kiện (FR-21, BR-63)
  public static async listCheckins(eventId: string, query: PaginationInput) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = { tickets: { registrations: { event_id: eventId } } };

    const [logs, total] = await Promise.all([
      prisma.checkin_logs.findMany({
        where,
        orderBy: { checkin_time: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          checkin_time: true,
          checkin_method: true,
          organizer_id: true,
          users: { select: { name: true } },
          tickets: {
            select: {
              id: true,
              registrations: {
                select: { users: { select: { id: true, name: true, email: true } } },
              },
            },
          },
        },
      }),
      prisma.checkin_logs.count({ where }),
    ]);

    return {
      checkins: logs.map((log) => ({
        id: log.id,
        ticket_id: log.tickets.id,
        user_id: log.tickets.registrations.users.id,
        name: log.tickets.registrations.users.name,
        email: log.tickets.registrations.users.email,
        checkin_time: log.checkin_time,
        // Phân biệt quét tại cổng với sinh viên tự xác nhận (API.md mục 5)
        checkin_method: log.checkin_method,
        checked_in_by: log.users?.name ?? null,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Xuất CSV lịch sử check-in (FR-22, BR-64) - trả trực tiếp, không lưu file trung gian
  public static async exportCheckinsCsv(eventId: string): Promise<string> {
    const logs = await prisma.checkin_logs.findMany({
      where: { tickets: { registrations: { event_id: eventId } } },
      orderBy: { checkin_time: 'asc' },
      select: {
        checkin_time: true,
        checkin_method: true,
        users: { select: { name: true } },
        tickets: {
          select: {
            id: true,
            registrations: {
              select: { users: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    return buildCsv(
      ['Ho ten', 'Email', 'Ma ve', 'Thoi diem check-in', 'Hinh thuc', 'Nguoi quet'],
      logs.map((log) => [
        log.tickets.registrations.users.name,
        log.tickets.registrations.users.email,
        log.tickets.id,
        log.checkin_time.toISOString(),
        log.checkin_method,
        log.users?.name ?? '',
      ])
    );
  }
}
