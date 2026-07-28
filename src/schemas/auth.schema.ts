import { z } from 'zod';

// Schema đăng ký tài khoản (FR-01) - API.md mục 2 (v0.3.0): body CHỈ nhận
// {name, email, password}; server luôn gán cứng role='student'. Tài khoản Ban tổ chức
// chỉ được tạo qua POST /admin/organizers (FR-38), không đăng ký tự do được nữa.
export const registerSchema = z.object({
  name: z
    .string({ error: 'Tên là bắt buộc' })
    .min(1, 'Tên không được để trống')
    .max(150, 'Tên tối đa 150 ký tự'),
  email: z
    .string({ error: 'Email là bắt buộc' })
    .email('Email không đúng định dạng')
    .max(255, 'Email tối đa 255 ký tự'),
  password: z
    .string({ error: 'Mật khẩu là bắt buộc' })
    .min(6, 'Mật khẩu tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu tối đa 100 ký tự'),
});

// Schema đăng nhập (FR-02)
export const loginSchema = z.object({
  email: z
    .string({ error: 'Email là bắt buộc' })
    .email('Email không đúng định dạng'),
  password: z
    .string({ error: 'Mật khẩu là bắt buộc' })
    .min(1, 'Mật khẩu không được để trống'),
});

// Schema quên mật khẩu (FR-07)
export const forgotPasswordSchema = z.object({
  email: z
    .string({ error: 'Email là bắt buộc' })
    .email('Email không đúng định dạng'),
});

// Schema đặt lại mật khẩu với token (FR-07)
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Token là bắt buộc' })
    .min(1, 'Token không được để trống'),
  new_password: z
    .string({ error: 'Mật khẩu mới là bắt buộc' })
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự'),
});

// Schema đổi mật khẩu khi đã đăng nhập (FR-04)
export const changePasswordSchema = z.object({
  old_password: z
    .string({ error: 'Mật khẩu cũ là bắt buộc' })
    .min(1, 'Mật khẩu cũ không được để trống'),
  new_password: z
    .string({ error: 'Mật khẩu mới là bắt buộc' })
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự'),
});

// Schema cập nhật thông tin cá nhân (FR-06) - BR-17: chỉ cho sửa
// {name, avatar_url, bio, social_links, club_name}, không cho sửa email/role/password ở đây
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên không được để trống')
    .max(150, 'Tên tối đa 150 ký tự')
    .optional(),
  avatar_url: z
    .string()
    .max(500, 'Link ảnh đại diện tối đa 500 ký tự')
    .optional(),
  bio: z.string().max(160, 'Tiểu sử tối đa 160 ký tự').optional(),
  // BR-17: club_name chỉ có ý nghĩa với role=organizer. Zod vẫn nhận field này với
  // mọi role, việc bỏ qua im lặng khi role khác được xử lý ở UserService.updateProfile.
  club_name: z
    .string()
    .max(150, 'Tên câu lạc bộ tối đa 150 ký tự')
    .optional(),
  // BR-18 (SRS mục 5.2): social_links là JSONB nhưng khoá phải thuộc đúng tập cố định
  // {facebook, website, tiktok, discord, instagram, zalo}; khoá ngoài tập -> 400
  social_links: z
    .object({
      facebook: z.string().optional(),
      website: z.string().optional(),
      tiktok: z.string().optional(),
      discord: z.string().optional(),
      instagram: z.string().optional(),
      zalo: z.string().optional(),
    })
    .strict()
    .optional(),
});

// Export các Type phái sinh từ Zod schema
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
