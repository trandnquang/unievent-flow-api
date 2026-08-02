import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { checkinQueue } from '../config/queues';
import { AppError } from '../utils/errors';
import { sanitizeTicket, SAFE_TICKET_SELECT } from '../utils/ticket';
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
    // FR-36 (sinh viên tự check-in khi bấm "Vào phòng họp"). Đây là lỗi HTTP thật, không
    // phải `result`.
    //
    // Mã EVENT_NOT_IN_PERSON (⭐ tách ở v0.7.1) — KHÁC với EVENT_NOT_ONLINE của luồng tự
    // check-in (BR-65). Hai ca ngược chiều nhau: ở đây từ chối vì sự kiện KHÔNG phải
    // in_person, còn bên kia từ chối vì sự kiện KHÔNG phải online. Trước v0.7.1 cả hai
    // dùng chung một mã nên giao diện rẽ nhánh theo `code` hiển thị sai thông điệp.
    if (event.location_type !== 'in_person') {
      throw new AppError(
        422,
        'EVENT_NOT_IN_PERSON',
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

  // Sinh viên tự check-in sự kiện trực tuyến (FR-36).
  // BR-107: sinh viên chỉ bấm MỘT nút "Vào phòng họp" — thao tác đó vừa mở join_url vừa gọi
  // endpoint này, không còn bước xác nhận riêng. Bằng chứng tham dự là checkin_time do SERVER
  // ghi khi hàm này chạy; KHÔNG nhận mốc thời gian nào do client gửi lên (body rỗng).
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
    // biên sau cho phép vào bù khi sự kiện kéo dài quá giờ. Vì mở link và được-tính-tham-dự
    // nay là cùng một hành vi (BR-107), cửa sổ này bao trọn cả hai — không có trạng thái
    // "đã mở phòng nhưng chưa được tính".
    const now = new Date();
    const opensAt = new Date(event.start_time.getTime() - 15 * 60 * 1000);
    const closesAt = new Date(event.end_time.getTime() + 30 * 60 * 1000);

    if (event.status !== 'active' || now < opensAt || now > closesAt) {
      throw new AppError(
        422,
        'SELF_CHECKIN_WINDOW_CLOSED',
        'Nút vào phòng họp chỉ mở từ 15 phút trước khi sự kiện bắt đầu đến 30 phút sau khi kết thúc.'
      );
    }

    if (ticket.status === 'checked_in') {
      throw new AppError(
        409,
        'ALREADY_CHECKED_IN',
        'Bạn đã được ghi nhận tham dự sự kiện này rồi.'
      );
    }

    if (ticket.status !== 'valid') {
      throw new AppError(
        422,
        'TICKET_NOT_VALID',
        'Vé này không còn hiệu lực để vào phòng họp.'
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
          'Bạn đã được ghi nhận tham dự sự kiện này rồi.'
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

      // BR-109: `select` tường minh — jwt_code không được nạp lên, không thể rò ra response
      return tx.tickets.findUniqueOrThrow({
        where: { id: ticketId },
        select: SAFE_TICKET_SELECT,
      });
    });

    return { ticket: sanitizeTicket(updated) };
  }

  // Lịch sử check-in của sự kiện (FR-21, BR-63)
  public static async listCheckins(eventId: string, query: PaginationInput) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = { tickets: { registrations: { event_id: eventId } } };

    const [logs, total, confirmedCount, checkedInCount] = await Promise.all([
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
      // ⭐ v1.1.0 (api_spec.md §5): hai con số của TOÀN SỰ KIỆN, ĐỘC LẬP với page/limit.
      // Màn quét QR tại cổng (M2-S01/M2-S02) cần bộ đếm "đã vào / tổng" ngay đầu màn hình,
      // nhưng GET /events/:id/dashboard là owner-only trong khi endpoint này là
      // owner-or-cohost — không có summary ở đây thì Co-host không hiển thị được bộ đếm,
      // hoặc phải tự cộng dồn theo trang (sai ngay khi có phân trang).
      // Chỉ là 2 phép COUNT trên cột đã có từ SCHEMA v1.0.0 ⇒ không phát sinh DDL.
      prisma.registrations.count({
        where: { event_id: eventId, status: 'confirmed' },
      }),
      prisma.tickets.count({
        where: { status: 'checked_in', registrations: { event_id: eventId } },
      }),
    ]);

    return {
      // ⭐ v1.1.0: đổi tên khoá `checkins` → `items` cho khớp api_spec.md §5, đồng thời đồng
      // bộ với GET /events/:eventId/registrations (§4b) vốn đã dùng `items`.
      items: logs.map((log) => ({
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
      summary: { confirmed: confirmedCount, checked_in: checkedInCount },
      // ⚠️ meta.pagination.total VẪN là số bản ghi checkin_logs — tổng của DANH SÁCH đang
      // phân trang, khác về nghiệp vụ với summary.* (tổng toàn sự kiện). Đừng gộp hai cái.
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
