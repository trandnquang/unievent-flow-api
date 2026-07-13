import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { $Enums } from '../../generated/prisma/client';

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

// Middleware kiểm tra quyền sở hữu resource (so sánh event.organizer_id với req.user.id)
export const requireOwnership = async (
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
