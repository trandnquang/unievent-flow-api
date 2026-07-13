import app from './app';
import { env } from './config/env';
import { prisma } from './config/db';

const bootstrap = async () => {
  try {
    // Kiểm tra kết nối CSDL PostgreSQL qua Prisma
    await prisma.$connect();
    console.log('✅ Kết nối cơ sở dữ liệu PostgreSQL thành công');

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 UniEvent Flow API đang chạy tại http://localhost:${env.PORT}`);
    });

    // Xử lý tắt ứng dụng an toàn (Graceful Shutdown)
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Nhận tín hiệu ${signal}. Đang đóng kết nối...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('✅ Đã ngắt kết nối CSDL và dừng server.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Lỗi khởi động ứng dụng:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

bootstrap();
