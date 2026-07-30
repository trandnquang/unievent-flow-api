import { Router } from 'express';
import multer from 'multer';
import { UploadController } from '../controllers/upload.controller';
import { env } from '../config/env';
import { requireAuth, requireActive } from '../middlewares/auth.middleware';
import { uploadRateLimiter } from '../middlewares/rateLimiter.middleware';

const router = Router();

// memoryStorage: giữ tệp trong RAM rồi đẩy thẳng lên Cloudinary. BR-111 cấm lưu nhị phân
// trên máy chủ ứng dụng, nên tuyệt đối KHÔNG dùng diskStorage ở đây.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
});

// BR-105: requireAuth + requireActive, KHÔNG giới hạn theo vai trò (mọi role đều cần tải
// ảnh: sinh viên đổi avatar, Ban tổ chức đặt ảnh bìa sự kiện).
// Rate limit 10 lần/giờ/tài khoản để endpoint không thành nơi lưu trữ miễn phí.
router.post(
  '/image',
  requireAuth,
  requireActive,
  uploadRateLimiter,
  // Vượt MAX_UPLOAD_SIZE_MB -> multer ném MulterError('LIMIT_FILE_SIZE') -> error.middleware
  // đổi thành 413 FILE_TOO_LARGE (BR-104).
  upload.single('file'),
  UploadController.uploadImage
);

export default router;
