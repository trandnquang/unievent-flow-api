// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '../../schemas/auth.schema';

// === REQUEST: tái dùng nguyên si schema validate thật ========================
//
// KHÔNG định nghĩa lại field nào ở đây. `registry.register()` gọi `.openapi(refId)`, mà
// `.openapi()` tạo BẢN SAO chứ không sửa schema gốc — nên `src/schemas/auth.schema.ts`
// giữ nguyên vai trò nguồn validate duy nhất, tài liệu không thể lệch với validate.

export const registerBodySchema = registry.register(
  'RegisterBody',
  registerSchema
);
export const loginBodySchema = registry.register('LoginBody', loginSchema);
export const forgotPasswordBodySchema = registry.register(
  'ForgotPasswordBody',
  forgotPasswordSchema
);
export const resetPasswordBodySchema = registry.register(
  'ResetPasswordBody',
  resetPasswordSchema
);
export const changePasswordBodySchema = registry.register(
  'ChangePasswordBody',
  changePasswordSchema
);
export const updateProfileBodySchema = registry.register(
  'UpdateProfileBody',
  updateProfileSchema
);

// === RESPONSE: schema DOCS-ONLY ==============================================
//
// Repo chưa từng có Zod schema cho response — wire thật đến từ SafeUser
// (src/utils/user.ts) = model Prisma `users` trừ password_hash/reset_token/reset_token_expires.
// Các schema dưới đây CHỈ phục vụ sinh tài liệu, KHÔNG được import vào tầng validate.

// BR-18: tập khoá cố định của social_links. Lấy thẳng từ updateProfileSchema để một ngày
// nào đó thêm/bớt mạng xã hội thì tài liệu tự đổi theo, không phải sửa hai nơi.
const socialLinksSchema = registry.register(
  'SocialLinks',
  updateProfileSchema.shape.social_links.unwrap().openapi({
    description:
      'Chỉ chấp nhận đúng 6 khoá này (BR-18); khoá ngoài tập -> HTTP 400. Khoá vắng mặt thì icon tương ứng ẩn ở trang công khai.',
  })
);

export const userSchema = registry.register(
  'User',
  z
    .object({
      id: z.uuid(),
      name: z.string().openapi({ example: 'Nguyễn Văn An' }),
      email: z.email().openapi({ example: 'sv.an@seed.unievent.local' }),
      role: z.enum(['student', 'organizer', 'admin']),
      avatar_url: z.string().nullable(),
      // BR-17: chỉ có ý nghĩa với role=organizer
      club_name: z.string().nullable(),
      bio: z.string().nullable(),
      social_links: socialLinksSchema.nullable(),
      is_active: z.boolean(),
      created_at: z.string().openapi({ format: 'date-time' }),
      updated_at: z.string().openapi({ format: 'date-time' }),
    })
    .openapi({
      description:
        'Người dùng đã lọc trường nhạy cảm (SafeUser): KHÔNG bao giờ chứa password_hash, reset_token, reset_token_expires.',
    })
);

// data của POST /auth/register, GET /users/me, PATCH /users/me
export const userResultSchema = z.object({ user: userSchema });

// data của POST /auth/login — wire THẬT là snake_case (src/services/auth.service.ts).
// Bảng mục 2 của api_spec.md viết {accessToken, expiresIn}: đó là mô tả cũ, không phải wire format.
export const loginResultSchema = registry.register(
  'LoginResult',
  z.object({
    access_token: z.string().openapi({
      description: 'JWT truyền qua header Authorization: Bearer <access_token>.',
    }),
    expires_in: z.number().int().openapi({
      description:
        'Số GIÂY còn hạn, lấy từ env JWT_EXPIRES_IN (mặc định 7200 = 2 giờ). Không có refresh token.',
      example: 7200,
    }),
    user: userSchema,
  })
);

// data của các endpoint chỉ trả thông báo (forgot-password, reset-password, change-password)
export const messageResultSchema = registry.register(
  'MessageResult',
  z.object({
    message: z.string().openapi({ example: 'Đổi mật khẩu thành công.' }),
  })
);
