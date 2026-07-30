import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { emailQueue } from '../config/queues';
import { AppError } from '../utils/errors';
import { invalidateActiveCache } from '../middlewares/auth.middleware';
import { buildPaginationMeta } from '../schemas/common.schema';
import {
  CreateOrganizerInput,
  QueryAdminEventsInput,
  QueryAdminUsersInput,
} from '../schemas/admin.schema';
import { sanitizeUser } from '../utils/user';
import { EventService } from './event.service';

const BCRYPT_ROUNDS = 10;

// Mật khẩu tạm cho tài khoản Ban tổ chức (BR-85): sinh bằng CSPRNG, không đoán được.
// base64url cho ra chuỗi an toàn khi copy từ email, không lẫn ký tự dễ nhìn nhầm của hex.
const generateTemporaryPassword = (): string =>
  crypto.randomBytes(12).toString('base64url');

export class AdminService {
  // ---------------------------------------------------------------- FR-29

  // Bật/tắt tài khoản người dùng
  public static async updateUserStatus(
    targetUserId: string,
    actingAdminId: string,
    isActive: boolean
  ) {
    const target = await prisma.users.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, is_active: true },
    });

    if (!target) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    }

    // BR-121 (Admin Self/Peer Protection Rule): chỉ chặn khi VÔ HIỆU HOÁ. Kích hoạt lại
    // một admin đang bị tắt là thao tác khôi phục, không có rủi ro khoá cứng hệ thống.
    if (!isActive) {
      // (a) chính admin đang thao tác — (b) một admin khác
      if (target.id === actingAdminId || target.role === 'admin') {
        throw new AppError(
          403,
          'CANNOT_DISABLE_ADMIN',
          'Không thể vô hiệu hoá tài khoản Quản trị viên.'
        );
      }
    }

    // (c) admin cuối cùng đang hoạt động — nhánh này về lý thuyết không tới được vì (b)
    // đã chặn mọi role=admin, nhưng giữ lại làm lưới an toàn nếu (b) được nới lỏng sau này.
    if (!isActive && target.role === 'admin') {
      const activeAdmins = await prisma.users.count({
        where: { role: 'admin', is_active: true },
      });

      if (activeAdmins <= 1) {
        throw new AppError(
          403,
          'CANNOT_DISABLE_ADMIN',
          'Không thể vô hiệu hoá tài khoản Quản trị viên.'
        );
      }
    }

    const updated = await prisma.users.update({
      where: { id: targetUserId },
      data: { is_active: isActive },
    });

    // BR-98 (Immediate Revocation Rule): xoá cache NGAY để việc thu hồi quyền có hiệu lực
    // từ request kế tiếp, thay vì phải chờ TTL 60s hoặc chờ access token hết hạn sau 2 giờ.
    await invalidateActiveCache(targetUserId);

    // NFR-22: ghi log audit cho mọi hành động Admin Override
    console.log(
      `🛡️  [AUDIT] Admin ${actingAdminId} đặt is_active=${isActive} cho tài khoản ${targetUserId}`
    );

    return { user: sanitizeUser(updated) };
  }

  // ---------------------------------------------------------------- FR-30

  // Buộc huỷ sự kiện (BR-96). Khác FR-11 ở đúng 2 điểm:
  //   - KHÔNG bị chặn bởi BR-37b: buộc huỷ được cả sự kiện đang diễn ra/đã kết thúc, vì
  //     vi phạm chính sách thường chỉ lộ ra SAU khi sự kiện đã bắt đầu (BR-96a).
  //   - cancelled_by = adminId thay vì chủ sự kiện.
  // Phần cascade dùng chung EventService.applyCancellation để hai luồng không trôi khỏi nhau.
  public static async forceCancelEvent(
    eventId: string,
    adminId: string,
    reason: string
  ) {
    const event = await prisma.events.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, title: true },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    // BR-96b: Quản trị viên VẪN bị chặn bởi BR-37c — huỷ lại sự kiện đã huỷ không có
    // ý nghĩa và có thể kích hoạt lặp các tác vụ dây chuyền.
    if (event.status === 'cancelled') {
      throw new AppError(
        409,
        'EVENT_ALREADY_CANCELLED',
        'Sự kiện này đã được huỷ trước đó.'
      );
    }

    const cancelled = await EventService.applyCancellation(
      eventId,
      adminId,
      reason
    );

    // NFR-22 + BR-106: audit log phải có đủ ai, cái gì, khi nào, vì sao
    console.log(
      `🛡️  [AUDIT] Admin ${adminId} buộc huỷ sự kiện ${eventId} ("${event.title}") — lý do: ${reason}`
    );

    return { event: cancelled };
  }

  // ---------------------------------------------------------------- FR-38

  // Cấp phát tài khoản Ban tổ chức. Đây là con đường DUY NHẤT tạo được role=organizer
  // (organizerCode đã bị loại bỏ hoàn toàn từ v0.3.0).
  public static async createOrganizer(input: CreateOrganizerInput) {
    const tempPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    let organizer;
    try {
      organizer = await prisma.users.create({
        data: {
          name: input.name,
          email: input.email,
          password_hash: passwordHash,
          role: 'organizer',
          club_name: input.club_name ?? null,
          is_active: true,
        },
      });
    } catch (error) {
      // BR-83: dùng chung ràng buộc UNIQUE email với /auth/register, và tái sử dụng luôn
      // mã lỗi có sẵn thay vì đặt mã riêng cho luồng admin.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Email này đã được sử dụng.'
        );
      }
      throw error;
    }

    // BR-86: đẩy job gửi thông tin đăng nhập. Mật khẩu plaintext CHỈ đi từ đây vào email —
    // không log, không trả về response (CBR 2). Lỗi hàng đợi không được làm hỏng 201 vì
    // tài khoản đã tạo xong; admin có thể dùng luồng quên mật khẩu để cấp lại.
    try {
      await emailQueue.add('organizer_credentials', {
        type: 'organizer_credentials',
        user_id: organizer.id,
        temp_password: tempPassword,
      });
    } catch (error) {
      console.error(
        '❌ Không đẩy được job gửi thông tin tài khoản Ban tổ chức:',
        error instanceof Error ? error.message : error
      );
    }

    console.log(
      `🛡️  [AUDIT] Đã cấp tài khoản Ban tổ chức ${organizer.id} (${organizer.email})`
    );

    return { organizer: sanitizeUser(organizer) };
  }

  // ---------------------------------------------------------------- FR-39

  // Tra cứu người dùng toàn hệ thống (BR-100/101/102).
  // Cùng với FR-41, đây là một trong hai nơi DUY NHẤT trả email của người khác.
  public static async listUsers(
    query: QueryAdminUsersInput,
    actingAdminId: string
  ) {
    const { page, limit, search, role, is_active } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.usersWhereInput = {};
    if (role) where.role = role;
    if (is_active !== undefined) where.is_active = is_active;
    // BR-101: khớp một phần trên name HOẶC email, không phân biệt hoa thường
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        // select tường minh: TUYỆT ĐỐI không để lọt password_hash/reset_token (BR-100)
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          club_name: true,
          avatar_url: true,
          is_active: true,
          created_at: true,
        },
      }),
      prisma.users.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        ...user,
        // BR-102: cờ để giao diện khoá nút thao tác trên chính admin đang đăng nhập
        is_self: user.id === actingAdminId,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // Tra cứu sự kiện toàn hệ thống (BR-103/110)
  public static async listEvents(query: QueryAdminEventsInput) {
    const { page, limit, search, status, organizer_id } = query;
    const skip = (page - 1) * limit;

    // BR-103: KHÔNG lọc mặc định theo status — trả sự kiện ở MỌI trạng thái, gồm cả
    // cancelled. Đây là khác biệt then chốt so với GET /events công khai (chỉ trả active).
    const where: Prisma.eventsWhereInput = {};
    if (status) where.status = status;
    if (organizer_id) where.organizer_id = organizer_id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { club_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.events.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          // BR-110: kèm tên/email BTC để admin đánh giá ảnh hưởng trước khi buộc huỷ
          users: { select: { id: true, name: true, email: true } },
          // ...và số vé đã phát hành
          _count: { select: { registrations: true } },
        },
      }),
      prisma.events.count({ where }),
    ]);

    return {
      events: events.map(({ users, _count, ...event }) => ({
        ...event,
        organizer: users,
        issued_tickets: _count.registrations,
      })),
      meta: buildPaginationMeta(page, limit, total),
    };
  }
}
