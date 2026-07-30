/**
 * Nạp dữ liệu thử nghiệm: chạy docs/seed.sql rồi bổ sung phần KHÔNG viết được bằng SQL thuần.
 *
 * Chạy: `npm run seed`
 *
 * Hai phần cần runtime:
 *   1. password_hash — bcrypt (cost 10, khớp auth.service.ts) cho mật khẩu demo dùng chung.
 *   2. tickets.jwt_code — JWT ký bằng TICKET_JWT_SECRET, payload {registration_id, event_id,
 *      ticket_id} và exp = end_time của sự kiện + 24h (BR-99).
 *
 * Vì sao ký JWT SAU khi chạy SQL chứ không thay chỗ giữ chỗ như password_hash: seed.sql đặt
 * mọi mốc thời gian tương đối theo now(), nên end_time chỉ được xác định lúc câu INSERT chạy.
 * Đọc ngược end_time từ CSDL đảm bảo `exp` luôn khớp tuyệt đối với dữ liệu thật — thay vì
 * phải nhân bản toàn bộ phép tính thời gian của seed.sql sang TypeScript rồi mong hai bên
 * không lệch nhau.
 */
import { readFileSync } from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import Redis from 'ioredis';
import { env } from '../src/config/env';

// Mật khẩu demo dùng chung cho MỌI tài khoản seed — chỉ phục vụ môi trường phát triển.
const DEMO_PASSWORD = 'Password123!';

// Khớp auth.service.ts / seedAdmin.ts để hash sinh ra ở đây đăng nhập được như hash thật
const BCRYPT_ROUNDS = 10;

// BR-99: vé sống tới end_time + 24h. Giá trị này phải khớp TICKET_EXPIRY_GRACE_SECONDS
// trong workers/processRegistration.ts, nếu không vé seed sẽ hết hạn lệch với vé thật.
const TICKET_EXPIRY_GRACE_SECONDS = 24 * 60 * 60;

const SEED_SQL_PATH = path.join(__dirname, '..', 'docs', 'seed.sql');

// Nhân đôi dấu nháy đơn — giá trị lấy từ .env nên không thể coi là an toàn theo mặc định
const sqlLiteral = (value: string): string => value.replace(/'/g, "''");

interface SeedTicketRow {
  ticket_id: string;
  registration_id: string;
  event_id: string;
  end_time: Date;
}

const main = async (): Promise<void> => {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    // --- Bước 1: thay chỗ giữ chỗ tĩnh -------------------------------------
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const adminEmail = env.ADMIN_SEED_EMAIL ?? 'admin@unievent.local';
    const adminName = env.ADMIN_SEED_NAME;

    const sql = readFileSync(SEED_SQL_PATH, 'utf8')
      .replaceAll('__PASSWORD_HASH__', sqlLiteral(passwordHash))
      .replaceAll('__ADMIN_EMAIL__', sqlLiteral(adminEmail))
      .replaceAll('__ADMIN_NAME__', sqlLiteral(adminName));

    // node-postgres chạy chuỗi nhiều câu lệnh (không tham số) bằng simple query protocol,
    // và PostgreSQL bọc cả chuỗi trong MỘT transaction ngầm — hỏng ở câu nào thì toàn bộ
    // seed được rollback, không để lại trạng thái nửa vời.
    await client.query(sql);
    console.log('✅ Đã chạy docs/seed.sql');

    // --- Bước 2: ký jwt_code theo end_time THẬT ----------------------------
    const { rows } = await client.query<SeedTicketRow>(`
      SELECT t.id AS ticket_id, r.id AS registration_id, e.id AS event_id, e.end_time
      FROM tickets t
      JOIN registrations r ON r.id = t.registration_id
      JOIN events e ON e.id = r.event_id
      WHERE t.id::text LIKE '5eed%'
      ORDER BY t.id
    `);

    let expiredCount = 0;
    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const row of rows) {
      const exp =
        Math.floor(row.end_time.getTime() / 1000) + TICKET_EXPIRY_GRACE_SECONDS;
      if (exp <= nowSeconds) expiredCount += 1;

      // BR-51: payload CHỈ gồm 3 định danh, không kèm thông tin cá nhân — mã QR bị chụp
      // lại là chuyện bình thường nên nội dung vé phải vô hại khi lộ.
      const jwtCode = jwt.sign(
        {
          registration_id: row.registration_id,
          event_id: row.event_id,
          ticket_id: row.ticket_id,
          exp,
        },
        env.TICKET_JWT_SECRET
      );

      await client.query('UPDATE tickets SET jwt_code = $1 WHERE id = $2', [
        jwtCode,
        row.ticket_id,
      ]);
    }

    console.log(
      `✅ Đã ký ${rows.length} jwt_code bằng TICKET_JWT_SECRET (${expiredCount} vé đã quá hạn — chủ ý, để test result=expired_ticket)`
    );

    await seedRedisState(client);
    await printSummary(client, adminEmail);
  } finally {
    await client.end();
  }
};

// Các tiền tố khoá nghiệp vụ sống HOÀN TOÀN trên Redis, không có cột PostgreSQL tương ứng
// (thiết kế hai pha có chủ đích, SRS §2.2.3). Dọn sạch trước khi seed là BẮT BUỘC, không
// phải cho gọn: reset riêng PostgreSQL sẽ để lại trạng thái mồ côi khiến lần chạy sau sai
// một cách rất khó truy.
//
// Ca cụ thể đã gặp: khoá check-in `checkin:{ticketId}` có TTL 24h (BR-91). Seed đưa vé về
// status='valid' nhưng khoá cũ vẫn còn, nên lần quét kế tiếp `SET NX` thất bại và trả
// `already_checked_in` cho một vé chưa hề được quét.
const VOLATILE_KEY_PATTERNS = [
  'event:*:tickets', // bộ đếm vé (BR-33/47)
  'checkin:*', // khoá chống check-in trùng, TTL 24h (BR-91)
  'hold:*', // khoá giữ chỗ đăng ký (BR-88)
  'idem:*', // khoá Idempotency-Key (API §1.7)
  'active:*', // cache trạng thái tài khoản (BR-98) — seed đổi is_active nên cache cũ sai
];

const seedRedisState = async (client: Client): Promise<void> => {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

  try {
    // SCAN thay vì KEYS: KEYS chặn toàn bộ Redis, thói quen xấu nếu bê nguyên sang môi
    // trường có dữ liệu thật.
    let removed = 0;
    for (const pattern of VOLATILE_KEY_PATTERNS) {
      const stream = redis.scanStream({ match: pattern, count: 200 });
      for await (const batch of stream as AsyncIterable<string[]>) {
        if (batch.length > 0) {
          await redis.del(...batch);
          removed += batch.length;
        }
      }
    }

    // Khởi tạo lại bộ đếm theo đúng công thức của view: max_tickets − (confirmed + pending).
    // Chỉ 'confirmed'/'pending' chiếm chỗ; 'failed'/'cancelled' đã hoàn vé (BR-89, BR-56).
    const { rows } = await client.query<{ event_id: string; remaining: string }>(`
      SELECT event_id, tickets_remaining_db AS remaining
      FROM v_event_registration_stats
      WHERE event_id::text LIKE '5eed%'
    `);

    const pipeline = redis.pipeline();
    for (const row of rows) {
      // Khớp ticketCounterKey() trong services/ticketCounter.service.ts
      pipeline.set(`event:${row.event_id}:tickets`, row.remaining);
    }
    await pipeline.exec();

    const soldOut = rows.filter((row) => Number(row.remaining) === 0).length;
    console.log(
      `✅ Đã xoá ${removed} khoá Redis cũ và khởi tạo ${rows.length} bộ đếm vé (${soldOut} sự kiện hết vé — chủ ý, để test 409 SOLD_OUT)`
    );
  } finally {
    redis.disconnect();
  }
};

const printSummary = async (
  client: Client,
  adminEmail: string
): Promise<void> => {
  const count = async (sql: string): Promise<number> => {
    const { rows } = await client.query<{ n: string }>(sql);
    return Number(rows[0]?.n ?? 0);
  };

  const stats: Array<[string, number]> = [
    ['users', await count(`SELECT count(*) n FROM users WHERE id::text LIKE '5eed%' OR email = '${adminEmail.replace(/'/g, "''")}'`)],
    ['events', await count(`SELECT count(*) n FROM events WHERE id::text LIKE '5eed%'`)],
    ['event_schedule', await count(`SELECT count(*) n FROM event_schedule WHERE id::text LIKE '5eed%'`)],
    ['event_updates', await count(`SELECT count(*) n FROM event_updates WHERE id::text LIKE '5eed%'`)],
    ['event_co_hosts', await count(`SELECT count(*) n FROM event_co_hosts WHERE event_id::text LIKE '5eed%'`)],
    ['registrations', await count(`SELECT count(*) n FROM registrations WHERE id::text LIKE '5eed%'`)],
    ['tickets', await count(`SELECT count(*) n FROM tickets WHERE id::text LIKE '5eed%'`)],
    ['checkin_logs', await count(`SELECT count(*) n FROM checkin_logs WHERE id::text LIKE '5eed%'`)],
    ['feedbacks', await count(`SELECT count(*) n FROM feedbacks WHERE id::text LIKE '5eed%'`)],
  ];

  console.log('');
  console.log('| BẢNG            | SỐ BẢN GHI |');
  console.log('|-----------------|------------|');
  for (const [table, n] of stats) {
    console.log(`| ${table.padEnd(15)} | ${String(n).padStart(10)} |`);
  }

  console.log('');
  console.log(`🔑 Mật khẩu demo cho MỌI tài khoản seed: ${DEMO_PASSWORD}`);
  console.log(`   Quản trị viên: ${adminEmail}`);
  console.log('   Sinh viên:     sv.an@seed.unievent.local (hoạt động)');
  console.log('                  sv.binh@seed.unievent.local (is_active=false)');
  console.log('   Ban tổ chức:   btc.cntt@seed.unievent.local (chủ sự kiện)');
  console.log('                  btc.english@seed.unievent.local (co-host)');
};

void main().catch((error: unknown) => {
  console.error(
    '❌ Seed thất bại:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
