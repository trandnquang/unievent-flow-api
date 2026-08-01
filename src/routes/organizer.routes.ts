import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import {
  requireAuth,
  requireActive,
  requireRole,
} from '../middlewares/auth.middleware';

const router = Router();

// ⚠️ TUYỆT ĐỐI KHÔNG dùng `router.use(requireAuth, …)` ở file này: GET /organizers/:userId là
// hồ sơ CÔNG KHAI (BR-27, FR-33) — một guard cấp router sẽ khoá luôn nó và làm vỡ trang công
// khai của Ban tổ chức. Hai route dưới đây có mức quyền NGƯỢC NHAU nên guard phải đặt TỪNG ROUTE.

// GET /organizers - Organizer đã đăng nhập (FR-33/37, api_spec.md mục 2 ⭐ v1.1.0).
// Cần đăng nhập vì đây là danh bạ nội bộ dùng để mời Co-host; response không chứa email nên
// vẫn không phải endpoint PII, nhưng cũng không có lý do để công khai cho người ngoài.
router.get(
  '/',
  requireAuth,
  requireActive,
  requireRole('organizer'),
  UserController.listOrganizers
);

// GET /organizers/:userId - Public (BR-27), không áp requireAuth/requireActive
router.get('/:userId', UserController.getOrganizerProfile);

export default router;
