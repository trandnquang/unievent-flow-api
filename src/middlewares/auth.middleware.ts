import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import { AppError } from '../utils/errors';
import { $Enums } from '../../generated/prisma/client';

// BR-98 (CBR 7): khoá cache trạng thái tài khoản. Giá trị '1' = đang hoạt động, '0' = đã
// vô hiệu hoá — lưu cả hai chiều để tài khoản bị khoá cũng không phải truy vấn lại mỗi request.
const activeCacheKey = (userId: string): string => `active:${userId}`;

// Xoá cache ngay khi FR-29 đổi trạng thái tài khoản, nhờ vậy việc thu hồi quyền có hiệu lực
// từ request KẾ TIẾP thay vì phải chờ TTL hết hạn (BR-98).
export const invalidateActiveCache = async (userId: string): Promise<void> => {
  try {
    await redis.del(activeCacheKey(userId));
  } catch (error) {
    // Không ném lỗi: thao tác quản trị đã ghi vào PostgreSQL thành công rồi. Xoá cache hỏng
    // chỉ làm chậm hiệu lực tối đa ACTIVE_CACHE_TTL_SECONDS, không làm sai kết quả.
    console.error(
      `❌ [ERROR] Không xoá được cache active:${userId} — thu hồi quyền sẽ trễ tối đa ${env.ACTIVE_CACHE_TTL_SECONDS}s:`,
      error instanceof Error ? error.message : error
    );
  }
};

interface JwtPayload {
  sub: string;
  role: $Enums.user_role;
  iat?: number;
  exp?: number;
}

// Middleware kiểm tra JWT hợp lệ (API.md mục 1.4)
export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token xác thực không hợp lệ');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };
    next();
  } catch (err) {
    throw new AppError(401, 'UNAUTHORIZED', 'Token xác thực đã hết hạn hoặc không hợp lệ');
  }
};

// Middleware re-check is_active trên MỌI request đã xác thực (API.md mục 1.4, CBR 7) -
// KHÔNG tin giá trị is_active tại thời điểm JWT được cấp, vì access token còn hiệu lực
// tới 2h sau khi Quản trị viên đã vô hiệu hoá tài khoản (BR-08, FR-29).
//
// BR-98: đọc qua cache Redis `active:{userId}` TTL 60s để không phải truy vấn CSDL mỗi
// request. FR-29 xoá cache ngay khi đổi trạng thái nên việc thu hồi quyền vẫn có hiệu lực
// từ request kế tiếp; TTL chỉ là lưới an toàn khi thao tác xoá cache thất bại.
export const requireActive = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    }

    const userId = req.user.id;
    let isActive: boolean | null = null;

    // Redis hỏng KHÔNG được chặn request: bỏ qua cache và tra thẳng CSDL. Đây là lùi về
    // nguồn sự thật, không phải cho qua vô điều kiện.
    try {
      const cached = await redis.get(activeCacheKey(userId));
      if (cached !== null) isActive = cached === '1';
    } catch (error) {
      console.error(
        '❌ [ERROR] Không đọc được cache trạng thái tài khoản, tra cứu CSDL thay thế:',
        error instanceof Error ? error.message : error
      );
    }

    if (isActive === null) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { is_active: true },
      });

      // Tài khoản không tồn tại xử lý như đã vô hiệu hoá — và vẫn ghi cache để một token
      // của tài khoản đã bị xoá không tạo ra truy vấn CSDL ở mọi request.
      isActive = user?.is_active === true;

      try {
        await redis.set(
          activeCacheKey(userId),
          isActive ? '1' : '0',
          'EX',
          env.ACTIVE_CACHE_TTL_SECONDS
        );
      } catch {
        /* không ghi được cache thì thôi, lần sau tra lại CSDL */
      }
    }

    if (!isActive) {
      throw new AppError(
        403,
        'ACCOUNT_DISABLED',
        'Tài khoản của bạn đã bị vô hiệu hoá. Vui lòng liên hệ quản trị viên.'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware kiểm tra vai trò người dùng (vd: requireRole('organizer'))
export const requireRole = (...allowedRoles: $Enums.user_role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Bạn không có quyền thực hiện thao tác này'
      );
    }
    next();
  };
};

// Middleware kiểm tra quyền sở hữu resource (so sánh event.organizer_id với req.user.id).
// Dùng cho thao tác KHÔNG uỷ quyền được cho Co-host: sửa/huỷ sự kiện (FR-10/11),
// thêm/xoá Co-host (FR-37) — API.md mục 1.4, SRS CBR 6.
export const requireOwnerOnly = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawEventId = req.params.eventId;
    const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId');
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    }

    const event = await prisma.events.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    if (event.organizer_id !== req.user.id) {
      throw new AppError(
        403,
        'FORBIDDEN_NOT_OWNER',
        'Bạn không phải chủ sở hữu của sự kiện này'
      );
    }

    // Gán event vào req để controller không cần query lại DB
    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware cho phép chủ sự kiện HOẶC Co-host đã chấp nhận lời mời (API.md mục 1.4, SRS CBR 6).
// Dùng cho thao tác Co-host được phép làm: đăng thông báo (FR-31), quản lý lịch trình (FR-32),
// check-in (FR-19→22). Co-host ở trạng thái pending/declined KHÔNG thoả điều kiện (BR-46).
export const requireOwnerOrCoHost = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawEventId = req.params.eventId;
    const eventId = Array.isArray(rawEventId) ? rawEventId[0] : rawEventId;
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError(400, 'BAD_REQUEST', 'Thiếu tham số eventId');
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
    }

    const event = await prisma.events.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Không tìm thấy sự kiện');
    }

    if (event.organizer_id !== req.user.id) {
      const coHost = await prisma.event_co_hosts.findUnique({
        where: {
          event_id_user_id: {
            event_id: eventId,
            user_id: req.user.id,
          },
        },
        select: { status: true },
      });

      if (!coHost || coHost.status !== 'accepted') {
        throw new AppError(
          403,
          'FORBIDDEN_NOT_OWNER',
          'Bạn không phải chủ sở hữu hoặc đơn vị đồng tổ chức của sự kiện này'
        );
      }
    }

    // Gán event vào req để controller không cần query lại DB
    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};
