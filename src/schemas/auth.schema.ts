import { z } from 'zod';

// Schema đăng ký tài khoản (FR-01) - Role chỉ nhận student hoặc organizer theo ENUM user_role
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
  role: z.enum(['student', 'organizer'], {
    error: 'Vai trò phải là student hoặc organizer',
  }),
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
  newPassword: z
    .string({ error: 'Mật khẩu mới là bắt buộc' })
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự'),
});

// Schema đổi mật khẩu khi đã đăng nhập (FR-04)
export const changePasswordSchema = z.object({
  oldPassword: z
    .string({ error: 'Mật khẩu cũ là bắt buộc' })
    .min(1, 'Mật khẩu cũ không được để trống'),
  newPassword: z
    .string({ error: 'Mật khẩu mới là bắt buộc' })
    .min(6, 'Mật khẩu mới tối thiểu 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự'),
});

// Schema cập nhật thông tin cá nhân (FR-06)
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên không được để trống')
    .max(150, 'Tên tối đa 150 ký tự')
    .optional(),
});

// Export các Type phái sinh từ Zod schema
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
