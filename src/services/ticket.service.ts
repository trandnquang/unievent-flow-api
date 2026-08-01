import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { generateQrDataUrl } from '../utils/qrcode';
import { buildPaginationMeta, PaginationInput } from '../schemas/common.schema';

export class TicketService {
  // Danh sách vé của chính sinh viên đang đăng nhập (FR-17)
  public static async listMyTickets(userId: string, query: PaginationInput) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = { registrations: { user_id: userId } };

    const [tickets, total] = await Promise.all([
      prisma.tickets.findMany({
        where,
        orderBy: { issued_at: 'desc' },
        skip,
        take: limit,
        include: {
          registrations: {
            select: {
              id: true,
              status: true,
              events: {
                select: {
                  id: true,
                  title: true,
                  cover_image: true,
                  location: true,
                  location_type: true,
                  start_time: true,
                  end_time: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.tickets.count({ where }),
    ]);

    return {
      // Làm phẳng quan hệ: FE cần vé kèm thông tin sự kiện, không cần lớp registration lồng.
      //
      // CLAUDE.md bất biến #7 — KHÔNG spread bản ghi `tickets` của Prisma vào response.
      // jwt_code là chuỗi JWT thô của vé, chỉ được phép sống trong ảnh QR (qr_code_data_url
      // của FR-18); trả kèm bản text làm token dễ bị copy/chia sẻ hơn hẳn, và API.md mục 4
      // không hề liệt kê field này. Liệt kê TƯỜNG MINH từng field thay vì dựa vào
      // destructuring `{ jwt_code: _, ...rest }`: chỉ cần thêm một cột vào bảng tickets là
      // bản spread lại âm thầm rò cột mới, còn cách này thì rò rỉ là bất khả thi về cấu trúc.
      tickets: tickets.map(({ registrations, ...ticket }) => ({
        id: ticket.id,
        status: ticket.status,
        issued_at: ticket.issued_at,
        registration_id: registrations.id,
        registration_status: registrations.status,
        event: registrations.events,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Chi tiết vé kèm mã QR (FR-18). Owner-only: quyền sở hữu gián tiếp qua registration.user_id
  public static async getTicketForUser(ticketId: string, userId: string) {
    const ticket = await prisma.tickets.findUnique({
      where: { id: ticketId },
      include: {
        // ⭐ v1.1.0 (api_spec.md §4): checked_in_at lấy qua LEFT JOIN checkin_logs theo
        // checkin_logs.ticket_id = tickets.id (cột đó UNIQUE nên quan hệ 1-1).
        // Vé chưa quét / chưa tự check-in ⇒ null.
        checkin_logs: { select: { checkin_time: true } },
        registrations: {
          select: {
            id: true,
            user_id: true,
            status: true,
            // ⭐ v1.1.0: holder_name = users.name qua registrations.user_id
            users: { select: { name: true } },
            events: {
              select: {
                id: true,
                title: true,
                location: true,
                location_type: true,
                join_url: true,
                start_time: true,
                end_time: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!ticket || ticket.registrations.user_id !== userId) {
      // 404 thay vì 403 để không lộ sự tồn tại vé của người khác
      throw new AppError(404, 'TICKET_NOT_FOUND', 'Không tìm thấy vé này');
    }

    const { registrations, checkin_logs: checkinLog } = ticket;
    const event = registrations.events;

    // Nội dung QR chính là jwt_code — máy quét ở cổng chỉ cần xác thực chữ ký (BR-109).
    // Đây là nơi DUY NHẤT được đọc jwt_code; nó không đi vào object trả về bên dưới.
    const qrCodeDataUrl = await generateQrDataUrl(ticket.jwt_code);

    return {
      // CLAUDE.md bất biến #7: liệt kê TƯỜNG MINH, không spread bản ghi tickets
      // (xem chú thích ở listMyTickets).
      ticket: {
        id: ticket.id,
        status: ticket.status,
        issued_at: ticket.issued_at,
        registration_id: registrations.id,
        registration_status: registrations.status,
        // ⭐ v1.1.0 (api_spec.md §4) — bốn field dưới đây phục vụ màn Chi tiết vé
        // (M3-S05 in_person / M2-S04 online), đọc từ cột đã có, không phát sinh DDL.
        event_title: event.title,
        holder_name: registrations.users.name,
        checked_in_at: checkinLog?.checkin_time ?? null,
        // BR-107: chỉ sự kiện TRỰC TUYẾN mới có nút "Vào phòng họp". Với in_person, khoá này
        // VẮNG MẶT hoàn toàn (không phải null) — tránh lộ một khoá vô nghĩa cho vé tại cổng.
        //
        // exactOptionalPropertyTypes: BẮT BUỘC dùng spread có điều kiện. Viết
        // `join_url: isOnline ? event.join_url : undefined` sẽ KHÔNG biên dịch được vì dưới
        // cờ này `undefined` không gán được cho một optional property. Phép kiểm `!== null`
        // cũng bắt buộc: cột events.join_url nullable trong Prisma — ràng buộc SQL
        // chk_event_location_fields đảm bảo non-null khi online, nhưng type system không biết.
        ...(event.location_type === 'online' && event.join_url !== null
          ? { join_url: event.join_url }
          : {}),
        event,
      },
      qr_code_data_url: qrCodeDataUrl,
    };
  }
}
