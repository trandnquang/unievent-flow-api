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
      // Làm phẳng quan hệ: FE cần vé kèm thông tin sự kiện, không cần lớp registration lồng
      tickets: tickets.map(({ registrations, ...ticket }) => ({
        ...ticket,
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
        registrations: {
          select: {
            id: true,
            user_id: true,
            status: true,
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

    const { registrations, ...rest } = ticket;

    // Nội dung QR chính là jwt_code — máy quét ở cổng chỉ cần xác thực chữ ký (BR-109)
    const qrCodeDataUrl = await generateQrDataUrl(ticket.jwt_code);

    return {
      ticket: {
        ...rest,
        registration_id: registrations.id,
        registration_status: registrations.status,
        event: registrations.events,
      },
      qr_code_data_url: qrCodeDataUrl,
    };
  }
}
