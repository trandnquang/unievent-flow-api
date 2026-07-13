import { users } from '../../generated/prisma/client';

export type SafeUser = Omit<
  users,
  'password_hash' | 'reset_token' | 'reset_token_expires'
>;

// Loại bỏ các trường bảo mật khỏi object User trước khi trả về client
export const sanitizeUser = (user: users): SafeUser => {
  const {
    password_hash: _pw,
    reset_token: _rt,
    reset_token_expires: _rte,
    ...safeUser
  } = user;
  return safeUser;
};
