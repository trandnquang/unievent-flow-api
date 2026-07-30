import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { redis } from '../config/redis';
import {
  registrationQueue,
  registrationTimeoutJobId,
} from '../config/queues';
import { AppError } from '../utils/errors';
import { buildPaginationMeta } from '../schemas/common.schema';
import { QueryEventRegistrationsInput } from '../schemas/registration.schema';
import { TicketCounterService } from './ticketCounter.service';

// BR-88: khoá giữ chỗ cho một đăng ký đang chờ worker xử lý.
// Đây là dữ liệu QUAN SÁT/ĐỐI SOÁT (soi Redis biết đăng ký nào đang treo), KHÔNG phải cơ
// chế kích hoạt bù trừ — việc đó do job hẹn giờ 'timeout' đảm nhiệm (xem config/queues.ts).
export const holdKey = (registrationId: string): string =>
  `hold:${registrationId}`;

// API.md mục 1.7: khoá chống trùng request, gắn userId để key do client tự đặt không va
// chạm và không dùng chéo được giữa các tài khoản.
const idempotencyKey = (userId: string, key: string): string =>
  `idem:${userId}:${key}`;

const IDEMPOTENCY_TTL_SECONDS = 30;
const IDEMPOTENCY_IN_PROGRESS = 'processing';

export interface CreateRegistrationResult {
  registration_id: string;
  status: string;
}

export class RegistrationService {
  // ---------------------------------------------------------------- FR-14

  public static async createRegistration(
    userId: string,
    eventId: string,
    idempotencyHeader?: string
  ): Promise<CreateRegistrationResult> {
    // BR-87 (Registration Eligibility Rule): chạy TRƯỚC khi chạm Redis. Nếu để sau, một
    // request vào sự kiện đã huỷ vẫn kịp trừ mất 1 vé khỏi bộ đếm trước khi bị phát hiện.
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, start_time: true },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    if (event.status !== 'active' || event.start_time <= new Date()) {
      throw new AppError(
        422,
        'EVENT_NOT_REGISTRABLE',
        'Sự kiện này hiện không nhận đăng ký (đã bị huỷ hoặc đã bắt đầu).'
      );
    }

    const idemKey = idempotencyHeader
      ? idempotencyKey(userId, idempotencyHeader)
      : null;

    // API.md mục 1.7: chặn chủ động request trùng lặp TRƯỚC khi giảm bộ đếm. Không có
    // header thì bỏ qua toàn bộ cơ chế này.
    if (idemKey) {
      const acquired = await redis.set(
        idemKey,
        IDEMPOTENCY_IN_PROGRESS,
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
        'NX'
      );

      if (acquired === null) {
        return this.replayIdempotentRequest(idemKey);
      }
    }

    try {
      return await this.runRegistrationFlow(userId, eventId, idemKey);
    } catch (error) {
      // Mọi nhánh lỗi đều nhả khoá để lần thử lại hợp lệ không bị chặn oan suốt 30 giây
      if (idemKey) await redis.del(idemKey);
      throw error;
    }
  }

  // Request trùng: trả lại kết quả của request gốc thay vì tạo đăng ký thứ hai
  private static async replayIdempotentRequest(
    idemKey: string
  ): Promise<CreateRegistrationResult> {
    const stored = await redis.get(idemKey);

    if (stored === null || stored === IDEMPOTENCY_IN_PROGRESS) {
      // Bản sao đang chạy dở, chưa có registrationId để trả lại
      throw new AppError(
        409,
        'DUPLICATE_REGISTRATION',
        'Yêu cầu đăng ký này đang được xử lý. Vui lòng đợi trong giây lát.'
      );
    }

    const registration = await prisma.registrations.findUnique({
      where: { id: stored },
      select: { id: true, status: true },
    });

    if (!registration) {
      throw new AppError(
        409,
        'DUPLICATE_REGISTRATION',
        'Yêu cầu đăng ký này đã được xử lý trước đó.'
      );
    }

    return {
      registration_id: registration.id,
      status: registration.status,
    };
  }

  private static async runRegistrationFlow(
    userId: string,
    eventId: string,
    idemKey: string | null
  ): Promise<CreateRegistrationResult> {
    // BR-49 (Duplicate Prevention Rule): kiểm tra TRƯỚC khi giảm bộ đếm (SRS §2.2.3 node D)
    // để thao tác bấm lại thông thường không gây một vòng trừ-rồi-hoàn vô ích.
    const existing = await prisma.registrations.findFirst({
      where: {
        event_id: eventId,
        user_id: userId,
        status: { in: ['pending', 'confirmed'] },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(
        409,
        'DUPLICATE_REGISTRATION',
        'Bạn đã đăng ký sự kiện này rồi.'
      );
    }

    // BR-47: giảm vé nguyên tử. Từ đây trở đi mọi nhánh thoát đều PHẢI hoàn vé.
    const decrement = await TicketCounterService.decrementTicket(eventId);

    // BR-48 (Sold-out Rule): hết vé -> trả ngay, không chạm PostgreSQL
    if (decrement === 'sold_out') {
      throw new AppError(409, 'SOLD_OUT', 'Sự kiện đã hết vé.');
    }

    let registration;
    try {
      registration = await prisma.registrations.create({
        data: { event_id: eventId, user_id: userId, status: 'pending' },
        select: { id: true, status: true },
      });
    } catch (error) {
      // Lưới chắn race của BR-49: hai request vào cùng lúc đều qua được pre-check ở trên,
      // request thua cuộc dính unique uq_registration_active_per_user_event (P2002).
      // BẮT BUỘC hoàn vé: vé đã trừ ở trên nhưng registration chưa kịp tồn tại, nên cơ chế
      // bù trừ BR-89/BR-93 (vốn dựa trên bản ghi registration) không phủ được ca này.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await TicketCounterService.refundTicket(eventId);
        throw new AppError(
          409,
          'DUPLICATE_REGISTRATION',
          'Bạn đã đăng ký sự kiện này rồi.'
        );
      }
      // Lỗi CSDL khác: cũng phải hoàn vé rồi mới ném tiếp
      await TicketCounterService.refundTicket(eventId);
      throw error;
    }

    // BR-88: khoá giữ chỗ, TTL cấu hình qua REGISTRATION_HOLD_TTL_SECONDS
    await redis.set(
      holdKey(registration.id),
      '1',
      'EX',
      env.REGISTRATION_HOLD_TTL_SECONDS
    );

    // BR-50: đẩy job rồi trả 202 ngay, không đợi worker.
    // Job 'timeout' hẹn giờ đúng bằng TTL giữ chỗ là bên thực sự phát hiện quá hạn.
    await registrationQueue.add('process', {
      type: 'process',
      registration_id: registration.id,
    });
    await registrationQueue.add(
      'timeout',
      { type: 'timeout', registration_id: registration.id },
      {
        jobId: registrationTimeoutJobId(registration.id),
        delay: env.REGISTRATION_HOLD_TTL_SECONDS * 1000,
      }
    );

    // Ghi đè khoá idempotency bằng registrationId thật để request trùng tới sau phát lại được
    if (idemKey) {
      await redis.set(
        idemKey,
        registration.id,
        'EX',
        IDEMPOTENCY_TTL_SECONDS
      );
    }

    return { registration_id: registration.id, status: registration.status };
  }

  // ------------------------------------------------- BR-88 / BR-89 / BR-93

  // Bù trừ khi đăng ký thất bại. Dùng chung cho 2 lối vào: nhánh catch của worker
  // processRegistration, và job hẹn giờ 'timeout' khi tới hạn giữ chỗ.
  public static async compensateFailedRegistration(
    registrationId: string
  ): Promise<void> {
    const registration = await prisma.registrations.findUnique({
      where: { id: registrationId },
      select: { event_id: true },
    });

    if (!registration) return;

    // BR-93 (Idempotent Compensation Rule): điều kiện status='pending' nằm NGAY TRONG câu
    // UPDATE. Chỉ hoàn vé khi chính câu lệnh này là bên đổi trạng thái — nếu đọc trước rồi
    // mới ghi, hai luồng cùng chạm một bản ghi sẽ hoàn vé hai lần và gây oversell.
    const result = await prisma.registrations.updateMany({
      where: { id: registrationId, status: 'pending' },
      data: { status: 'failed', processed_at: new Date() },
    });

    // 0 dòng = đã được luồng khác xử lý xong. Đây là nhánh BÌNH THƯỜNG, không phải lỗi.
    if (result.count === 0) return;

    await TicketCounterService.refundTicket(registration.event_id);
    await redis.del(holdKey(registrationId));

    // NFR-21: log WARN để đối soát thủ công qua view v_event_registration_stats
    console.warn(
      `⚠️  [WARN] Đăng ký ${registrationId} thất bại — đã hoàn 1 vé về bộ đếm sự kiện ${registration.event_id}`
    );
  }

  // ---------------------------------------------------------------- FR-15/16

  // Polling trạng thái xử lý. Owner-only theo registration.user_id (KHÔNG phải organizer).
  public static async getRegistrationForUser(
    registrationId: string,
    userId: string
  ) {
    const registration = await prisma.registrations.findUnique({
      where: { id: registrationId },
      include: { tickets: true },
    });

    if (!registration || registration.user_id !== userId) {
      // Trả 404 thay vì 403 để không lộ sự tồn tại của đăng ký người khác
      throw new AppError(
        404,
        'REGISTRATION_NOT_FOUND',
        'Không tìm thấy đăng ký này'
      );
    }

    const { tickets, ...rest } = registration;

    // status='failed' là GIÁ TRỊ NGHIỆP VỤ trong body 200 (FE hiển thị MSG-43),
    // không phải lỗi HTTP.
    return {
      registration: rest,
      ...(tickets ? { ticket: tickets } : {}),
    };
  }

  // ---------------------------------------------------------------- FR-41

  // Danh sách người đăng ký của một sự kiện, dành cho người vận hành (BR-113).
  // ⚠️ BR-114: kết quả chứa `email` — dữ liệu cá nhân. Cùng với GET /admin/users, đây là
  // hai nơi DUY NHẤT trong hệ thống trả email của người khác. Quyền do requireOwnerOrCoHost
  // đảm bảo ở tầng route, không được nới xuống public.
  public static async listEventRegistrations(
    eventId: string,
    query: QueryEventRegistrationsInput
  ) {
    const { page, limit, status, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.registrationsWhereInput = { event_id: eventId };
    if (status) where.status = status;
    // BR-114: khớp một phần trên name, không phân biệt hoa thường
    if (search) {
      where.users = { name: { contains: search, mode: 'insensitive' } };
    }

    const [registrations, total] = await Promise.all([
      prisma.registrations.findMany({
        where,
        orderBy: { requested_at: 'desc' },
        skip,
        take: limit,
        select: {
          status: true,
          requested_at: true,
          users: { select: { id: true, name: true, email: true } },
          tickets: { select: { status: true } },
        },
      }),
      prisma.registrations.count({ where }),
    ]);

    return {
      items: registrations.map((registration) => ({
        user_id: registration.users.id,
        name: registration.users.name,
        email: registration.users.email,
        registered_at: registration.requested_at,
        reg_status: registration.status,
        // Suy ra từ tickets.status: vé đã checked_in nghĩa là người này đã có mặt
        checkin_status:
          registration.tickets?.status === 'checked_in'
            ? 'checked_in'
            : 'not_checked_in',
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // ---------------------------------------------------------------- FR-34

  // Sinh viên tự huỷ đăng ký (BR-55, BR-56)
  public static async cancelRegistration(
    registrationId: string,
    userId: string
  ) {
    const registration = await prisma.registrations.findUnique({
      where: { id: registrationId },
      include: { tickets: true },
    });

    if (!registration || registration.user_id !== userId) {
      throw new AppError(
        404,
        'REGISTRATION_NOT_FOUND',
        'Không tìm thấy đăng ký này'
      );
    }

    // BR-55 (Ownership & Status Rule)
    if (registration.status !== 'confirmed') {
      throw new AppError(
        422,
        'REGISTRATION_NOT_CANCELLABLE',
        'Đăng ký này hiện không thể huỷ (đã bị huỷ hoặc chưa được xác nhận).'
      );
    }

    if (registration.tickets?.status === 'checked_in') {
      throw new AppError(
        422,
        'CANNOT_CANCEL_CHECKED_IN_TICKET',
        'Vé đã được check-in, không thể huỷ đăng ký.'
      );
    }

    // BR-56 (a): đổi CẢ registration VÀ ticket trong cùng 1 transaction. Bản cũ chỉ đổi
    // ticket khiến registration kẹt ở 'confirmed' -> chặn đăng ký lại, gửi nhầm email
    // nhắc lịch, dashboard đếm sai.
    const cancelled = await prisma.$transaction(async (tx) => {
      // Điều kiện status='confirmed' nằm trong câu UPDATE để hai request huỷ đồng thời
      // không cùng đi tới bước hoàn vé (cùng nguyên tắc với BR-93).
      const updated = await tx.registrations.updateMany({
        where: { id: registrationId, status: 'confirmed' },
        data: { status: 'cancelled', processed_at: new Date() },
      });

      if (updated.count === 0) {
        throw new AppError(
          422,
          'REGISTRATION_NOT_CANCELLABLE',
          'Đăng ký này hiện không thể huỷ (đã bị huỷ hoặc chưa được xác nhận).'
        );
      }

      if (registration.tickets) {
        await tx.tickets.update({
          where: { id: registration.tickets.id },
          data: { status: 'cancelled' },
        });
      }

      return tx.registrations.findUniqueOrThrow({
        where: { id: registrationId },
        include: { tickets: true },
      });
    });

    // BR-56 (b): CHỈ hoàn vé SAU KHI transaction commit thành công. Thứ tự có chủ đích —
    // hoàn vé trước rồi transaction thất bại sẽ phát dư một suất vé.
    await TicketCounterService.refundTicket(registration.event_id);

    const { tickets, ...rest } = cancelled;
    return { registration: rest, ticket: tickets };
  }
}
