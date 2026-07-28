import app from './app';
import { env } from './config/env';
import { prisma } from './config/db';
import { pingRedis, disconnectRedis } from './config/redis';

const bootstrap = async () => {
  try {
    // Kiểm tra kết nối CSDL PostgreSQL qua Prisma
    await prisma.$connect();
    console.log('✅ Kết nối cơ sở dữ liệu PostgreSQL thành công');

    // Redis là phụ thuộc bắt buộc — không kết nối được thì dừng hẳn, không chạy tiếp
    await pingRedis();
    console.log('✅ Kết nối Redis thành công');

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 UniEvent Flow API đang chạy tại http://localhost:${env.PORT}`);
    });

    // Xử lý tắt ứng dụng an toàn (Graceful Shutdown)
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang đóng kết nối...`);
      server.close(async () => {
        await prisma.$disconnect();
        await disconnectRedis();
        console.log('✅ Đã ngắt kết nối CSDL, Redis và dừng server.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    await prisma.$disconnect();
    await disconnectRedis().catch(() => undefined);
    process.exit(1);
  }
};

bootstrap();
