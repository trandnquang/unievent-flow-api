import bcrypt from 'bcrypt';
import { env } from '../src/config/env';
import { prisma } from '../src/config/db';

// SRS Assumption #11: tài khoản Quản trị viên ĐẦU TIÊN được tạo bằng script này lúc triển
// khai, KHÔNG qua giao diện và KHÔNG qua bất kỳ endpoint public nào.
//
// Lý do phải có: toàn bộ chuỗi cấp quyền là Admin -> Organizer (FR-38) -> sự kiện.
// FR-01 gán cứng role='student' cho mọi tài khoản tự đăng ký (BR-03) và hệ thống không có
// chức năng thăng cấp tài khoản sẵn có lên admin — nếu không có script này thì mắt xích
// đầu tiên của chuỗi treo lơ lửng và không ai dựng lại hệ thống từ đầu được.
//
// Chạy: npm run seed:admin
const main = async (): Promise<void> => {
  const email = env.ADMIN_SEED_EMAIL;
  const password = env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    console.error(
      '❌ Thiếu ADMIN_SEED_EMAIL hoặc ADMIN_SEED_PASSWORD trong biến môi trường.'
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ ADMIN_SEED_PASSWORD phải có tối thiểu 8 ký tự.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // upsert để chạy lại script nhiều lần không lỗi (vd: đổi mật khẩu admin sau khi lộ).
  // Cố tình KHÔNG đổi email ở nhánh update — email là khoá định danh của bản ghi.
  const admin = await prisma.users.upsert({
    where: { email },
    update: {
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
      name: env.ADMIN_SEED_NAME,
    },
    create: {
      email,
      name: env.ADMIN_SEED_NAME,
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
    },
  });

  console.log(`✅ Tài khoản Quản trị viên sẵn sàng: ${admin.email} (${admin.id})`);
  console.log(
    '⚠️  Mật khẩu lấy từ ADMIN_SEED_PASSWORD — đổi ngay sau lần đăng nhập đầu tiên.'
  );
};

main()
  .catch((error: unknown) => {
    console.error(
      '❌ Tạo tài khoản Quản trị viên thất bại:',
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
