/**
 * Kiểm tra kết nối thật tới 4 dịch vụ ngoài mà API phụ thuộc: PostgreSQL, Redis,
 * Google Gemini (FR-25/26) và Cloudinary (FR-40).
 *
 * Chạy: `npm run check:connections`
 *
 * Dùng khi mới dựng máy, mới đổi khoá trong .env, hoặc khi một luồng phụ thuộc dịch vụ ngoài
 * đột nhiên hỏng — để tách bạch "sai cấu hình" khỏi "sai logic" trước khi đi dò mã nguồn.
 * Script TUYỆT ĐỐI không in giá trị khoá bí mật ra log.
 */
import { env } from '../src/config/env';
import { prisma } from '../src/config/db';
import { redis } from '../src/config/redis';
import { cloudinary, isCloudinaryConfigured } from '../src/config/cloudinary';
import { GoogleGenAI, Type } from '@google/genai';

interface CheckRow {
  service: string;
  status: 'PASS' | 'FAIL';
  ms: number;
  detail: string;
}

const rows: CheckRow[] = [];

const run = async (
  service: string,
  check: () => Promise<string>
): Promise<void> => {
  const startedAt = Date.now();
  try {
    const detail = await check();
    rows.push({ service, status: 'PASS', ms: Date.now() - startedAt, detail });
  } catch (error) {
    // HTTP status của dịch vụ ngoài là manh mối chẩn đoán quan trọng nhất: 401/403 là sai
    // khoá, 404 là sai tên model/tài nguyên, 429 là hết quota. Giữ lại nếu SDK có gắn.
    const httpStatus = (error as { status?: unknown })?.status;
    const message = error instanceof Error ? error.message : String(error);

    rows.push({
      service,
      status: 'FAIL',
      ms: Date.now() - startedAt,
      detail: `${typeof httpStatus === 'number' ? `[HTTP ${httpStatus}] ` : ''}${message}`
        .replace(/\s+/g, ' ')
        .slice(0, 400),
    });
  }
};

const checkAll = async (): Promise<void> => {
  await run('PostgreSQL / SELECT 1', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    return `ok=${result[0]?.ok}`;
  });

  // VIEW v_event_registration_stats KHÔNG có trong schema.prisma nên chỉ truy vấn được bằng
  // $queryRaw. Kiểm riêng vì view hỏng/thiếu thì FR-27 và luồng đối soát vé đều gãy.
  await run('PostgreSQL / v_event_registration_stats', async () => {
    const sample = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM v_event_registration_stats LIMIT 1`;
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'v_event_registration_stats'
      ORDER BY ordinal_position`;

    return `rows=${sample.length}, cols=[${columns.map((c) => c.column_name).join(', ')}]`;
  });

  await run('Redis / PING', async () => {
    const pong = await redis.ping();
    const info = await redis.info('server');
    const version = /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? '?';
    return `${pong}, redis_version=${version}`;
  });

  // Gọi thật một lượt generateContent với ĐÚNG cấu hình sản xuất (ép JSON theo schema) —
  // liệt kê model là không đủ: model bị Google khai tử vẫn nằm trong ListModels nhưng
  // generateContent trả 404.
  await run(`Gemini / ${env.GEMINI_MODEL}`, async () => {
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY rỗng hoặc không nạp được từ .env');
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: 'Trả về JSON {"ok": true}',
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { ok: { type: Type.BOOLEAN } },
          required: ['ok'],
        },
        temperature: 0,
      },
    });

    const raw = response.text;
    if (!raw) throw new Error('Phản hồi rỗng (không có text)');

    return `HTTP 200, parse JSON OK -> ${JSON.stringify(JSON.parse(raw))}`;
  });

  await run('Cloudinary / api.ping', async () => {
    if (!isCloudinaryConfigured()) {
      throw new Error('Thiếu CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET');
    }

    const result = await cloudinary.api.ping();
    return `status=${result.status}, cloud_name=${cloudinary.config().cloud_name}, folder=${env.CLOUDINARY_FOLDER}`;
  });

  // api.ping() chỉ chứng minh khoá đọc được; upload thật mới chứng minh quyền GHI vào đúng
  // thư mục cấu hình. Ảnh 1x1 được xoá ngay để không để lại rác trên tài khoản.
  await run('Cloudinary / upload+destroy 1x1', async () => {
    if (!isCloudinaryConfigured()) throw new Error('Thiếu cấu hình Cloudinary');

    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const uploaded = await cloudinary.uploader.upload(png1x1, {
      folder: env.CLOUDINARY_FOLDER,
      resource_type: 'image',
    });
    const destroyed = await cloudinary.uploader.destroy(uploaded.public_id);

    return `uploaded ${uploaded.width}x${uploaded.height} -> ${uploaded.public_id}, destroy=${destroyed.result}`;
  });
};

const printReport = (): number => {
  const pad = (value: string, width: number): string =>
    value + ' '.repeat(Math.max(0, width - value.length));
  const nameWidth = Math.max(...rows.map((row) => row.service.length), 12);

  console.log('');
  console.log(`| ${pad('SERVICE', nameWidth)} | STATUS | ${pad('MS', 6)} | DETAIL`);
  console.log(`|${'-'.repeat(nameWidth + 2)}|--------|--------|--------`);

  for (const row of rows) {
    console.log(
      `| ${pad(row.service, nameWidth)} | ${pad(row.status, 6)} | ${pad(String(row.ms), 6)} | ${row.detail}`
    );
  }

  const failed = rows.filter((row) => row.status === 'FAIL').length;
  console.log('');
  console.log(`Tổng: ${rows.length - failed} PASS / ${failed} FAIL`);

  return failed;
};

const main = async (): Promise<void> => {
  await checkAll();
  const failed = printReport();

  await prisma.$disconnect();
  redis.disconnect();

  // Thoát khác 0 khi có dịch vụ hỏng để dùng được trong script CI/khởi động
  process.exit(failed > 0 ? 1 : 0);
};

void main();
