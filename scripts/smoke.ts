/**
 * Kiểm thử đầu-cuối toàn bộ 50 endpoint theo docs/api_spec.md.
 *
 * Chạy: `npm run smoke` (cần `npm run dev`, `npm run worker` và Docker pg/redis/mailpit đang sống)
 *
 * `npm run smoke` LUÔN chạy `npm run seed` trước. Bắt buộc, không phải tiện tay: bộ test này
 * thay đổi trạng thái thật (dùng reset_token một lần, check-in vé, huỷ sự kiện, gán nhãn
 * cảm xúc...). Chạy lần hai trên CSDL đã bẩn sẽ cho hàng loạt FAIL giả — 409/404 vì bản ghi
 * đã ở trạng thái đích chứ không phải vì mã nguồn sai.
 *
 * Mỗi lời gọi kiểm 3 lớp:
 *   1. HTTP status đúng đặc tả
 *   2. Envelope §1.2 — 2xx: {success:true, data}; lỗi: {success:false, error:{code,message}};
 *      endpoint danh sách phải có meta.pagination
 *   3. Wire format snake_case — quét đệ quy MỌI khoá trong body, bắt bất kỳ khoá camelCase nào
 *
 * Ngoài ra kiểm 8 ca lỗi nghiệp vụ tiêu biểu và 2 luồng bất đồng bộ (đăng ký → vé,
 * phân tích cảm xúc → summary đổi số).
 */
import Redis from 'ioredis';
import { env } from '../src/config/env';

const BASE = `http://localhost:${env.PORT}/api/v1`;
const DEMO_PASSWORD = 'Password123!';

// --- Định danh bản ghi seed (docs/seed.sql) ---------------------------------
const U = {
  student: '5eed0001-0000-4000-8000-000000000001', // sv.an
  disabled: '5eed0001-0000-4000-8000-000000000002', // sv.binh, is_active=false
  org1: '5eed0001-0000-4000-8000-000000000003', // btc.cntt, chủ sự kiện
  org2: '5eed0001-0000-4000-8000-000000000004', // btc.english, co-host
  student9: '5eed0001-0000-4000-8000-000000000009', // sv.linh
};
const EMAIL = {
  student: 'sv.an@seed.unievent.local',
  disabled: 'sv.binh@seed.unievent.local',
  org1: 'btc.cntt@seed.unievent.local',
  org2: 'btc.english@seed.unievent.local',
  student9: 'sv.linh@seed.unievent.local',
};
const E = {
  past: '5eed0002-0000-4000-8000-000000000001', // đã kết thúc, in_person
  future: '5eed0002-0000-4000-8000-000000000002', // +30 ngày
  onlineNow: '5eed0002-0000-4000-8000-000000000003', // online, ĐANG trong cửa sổ BR-95
  soldOut: '5eed0002-0000-4000-8000-000000000004', // hết vé hẳn
  ownedByOrg2: '5eed0002-0000-4000-8000-000000000008',
  onlineFuture: '5eed0002-0000-4000-8000-000000000009', // online, +5 ngày (ngoài cửa sổ)
  ongoing: '5eed0002-0000-4000-8000-000000000010', // in_person, đang diễn ra
};
const T = {
  selfCheckin: '5eed0006-0000-4000-8000-000000000006', // valid, E3 online trong cửa sổ
  scan: '5eed0006-0000-4000-8000-000000000015', // valid, E10 in_person đang diễn ra
  expired: '5eed0006-0000-4000-8000-000000000001', // E1, jwt đã quá hạn
};
const RESET_TOKEN_VALID = 'seed-reset-token-con-han-0000000000000001';
const RESET_TOKEN_EXPIRED = 'seed-reset-token-het-han-0000000000000002';

// --- Thu thập kết quả -------------------------------------------------------
type Severity = 'code' | 'doc';

interface Result {
  n: number;
  label: string;
  method: string;
  path: string;
  expected: string;
  actual: string;
  pass: boolean;
  notes: string[];
  severity?: Severity;
}

const results: Result[] = [];
let counter = 0;

// Khoá camelCase là lỗi wire format: quy ước đã chốt là snake_case toàn hệ thống (CLAUDE.md).
const findCamelCaseKeys = (value: unknown, trail = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findCamelCaseKeys(item, `${trail}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return [];

  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/[a-z0-9][A-Z]/.test(key)) found.push(trail ? `${trail}.${key}` : key);
    found.push(...findCamelCaseKeys(child, trail ? `${trail}.${key}` : key));
  }
  return found;
};

interface CallOptions {
  token?: string | undefined;
  body?: unknown;
  headers?: Record<string, string>;
  /** Kỳ vọng envelope danh sách: bắt buộc có meta.pagination */
  expectPagination?: boolean;
  /** Mã lỗi nghiệp vụ kỳ vọng trong error.code */
  expectCode?: string;
  /** Response không phải JSON (vd CSV) */
  raw?: boolean;
  /** Body multipart dựng sẵn */
  form?: FormData;
}

const call = async (
  label: string,
  method: string,
  path: string,
  expectStatus: number,
  options: CallOptions = {}
): Promise<{ status: number; json: any; text: string }> => {
  counter += 1;
  const notes: string[] = [];

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let status = 0;
  let text = '';
  let json: any = null;

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      ...(options.form
        ? { body: options.form }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
    });
    status = response.status;
    if (options.raw) {
      // Đọc BYTE thô: response.text() của fetch bóc mất BOM theo thuật toán "UTF-8 decode"
      // của WHATWG, nên không kiểm được BOM mà FR-22 cố tình thêm vào cho Excel.
      text = Buffer.from(await response.arrayBuffer()).toString('utf8');
    } else {
      text = await response.text();
    }
    if (!options.raw && text) {
      try {
        json = JSON.parse(text);
      } catch {
        notes.push('body không phải JSON hợp lệ');
      }
    }
  } catch (error) {
    notes.push(`không gọi được: ${error instanceof Error ? error.message : error}`);
  }

  // --- Lớp 1: status
  const statusOk = status === expectStatus;
  if (!statusOk) notes.push(`status ${status} ≠ ${expectStatus}`);

  // --- Lớp 2: envelope §1.2
  if (!options.raw && status !== 204 && json !== null) {
    if (status >= 200 && status < 300) {
      if (json.success !== true) notes.push('thiếu success:true');
      if (!('data' in json)) notes.push('thiếu data');
      if (options.expectPagination && !json.meta?.pagination) {
        notes.push('thiếu meta.pagination');
      }
    } else {
      if (json.success !== false) notes.push('thiếu success:false');
      if (!json.error?.code) notes.push('thiếu error.code');
      if (!json.error?.message) notes.push('thiếu error.message');
      if (options.expectCode && json.error?.code !== options.expectCode) {
        notes.push(`error.code=${json.error?.code} ≠ ${options.expectCode}`);
      }
    }
  }
  if (status === 204 && text.length > 0) notes.push('204 nhưng có body');

  // --- Lớp 3: wire format snake_case
  if (!options.raw && json !== null) {
    const camel = findCamelCaseKeys(json);
    if (camel.length > 0) notes.push(`khoá camelCase: ${camel.slice(0, 5).join(', ')}`);
  }

  results.push({
    n: counter,
    label,
    method,
    path,
    expected: options.expectCode ? `${expectStatus} ${options.expectCode}` : String(expectStatus),
    actual: options.expectCode ? `${status} ${json?.error?.code ?? '-'}` : String(status),
    pass: notes.length === 0,
    notes,
  });

  return { status, json, text };
};

const login = async (email: string): Promise<string> => {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const body: any = await response.json();
  if (!body?.data?.access_token) {
    throw new Error(`Đăng nhập ${email} thất bại: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data.access_token;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Rate limit của §1.6 tính theo IP/tài khoản và sống trên Redis. Bộ test gọi login/register
// nhiều lần hơn ngưỡng thật nên phải dọn, nếu không 429 sẽ che mất kết quả thật.
const clearRateLimits = async (): Promise<void> => {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) await redis.del(...keys);
  redis.disconnect();
};

// 1x1 PNG hợp lệ — dùng cho ca upload thành công (qua được cả kiểm MIME lẫn magic bytes)
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const main = async (): Promise<void> => {
  await clearRateLimits();

  // ======================================================== 0. Health
  // /health nằm NGOÀI tiền tố /api/v1 nên gọi thẳng, không qua helper call()
  {
    const response = await fetch(`http://localhost:${env.PORT}/health`);
    const json: any = await response.json();
    counter += 1;
    results.push({
      n: counter,
      label: 'Health check',
      method: 'GET',
      path: '/health',
      expected: '200',
      actual: String(response.status),
      pass: response.status === 200 && json?.success === true,
      notes:
        response.status === 200 && json?.success === true
          ? []
          : [`status ${response.status}, body ${JSON.stringify(json).slice(0, 80)}`],
    });
  }

  // ======================================================== 1. Auth (6)
  const newEmail = `smoke.${Date.now()}@seed.unievent.local`;

  await call('FR-01 đăng ký tài khoản', 'POST', '/auth/register', 201, {
    body: { name: 'Người dùng Smoke Test', email: newEmail, password: DEMO_PASSWORD },
  });

  await call('FR-01 email trùng', 'POST', '/auth/register', 409, {
    body: { name: 'Trùng email', email: newEmail, password: DEMO_PASSWORD },
    expectCode: 'EMAIL_ALREADY_EXISTS',
  });

  const loginRes = await call('FR-02 đăng nhập', 'POST', '/auth/login', 200, {
    body: { email: EMAIL.student, password: DEMO_PASSWORD },
  });
  const studentToken: string = loginRes.json?.data?.access_token;

  await call('FR-02 sai mật khẩu', 'POST', '/auth/login', 401, {
    body: { email: EMAIL.student, password: 'SaiMatKhau123!' },
    expectCode: 'INVALID_CREDENTIALS',
  });

  await call('BR-98 tài khoản bị vô hiệu hoá', 'POST', '/auth/login', 403, {
    body: { email: EMAIL.disabled, password: DEMO_PASSWORD },
    expectCode: 'ACCOUNT_DISABLED',
  });

  await clearRateLimits();
  const org1Token = await login(EMAIL.org1);
  const org2Token = await login(EMAIL.org2);
  const student9Token = await login(EMAIL.student9);
  const adminToken = await login(env.ADMIN_SEED_EMAIL ?? 'admin@unievent.local');
  const newUserToken = await login(newEmail);

  // Tên field là old_password/new_password (auth.schema.ts). api_spec §2 mô tả bằng
  // {oldPassword, newPassword} nhưng đó chỉ là văn bản diễn giải — wire format đã chốt
  // là snake_case toàn hệ thống (CLAUDE.md).
  await call('FR-04 đổi mật khẩu', 'POST', '/auth/change-password', 200, {
    token: newUserToken,
    body: { old_password: DEMO_PASSWORD, new_password: 'MatKhauMoi123!' },
  });

  await call('FR-03 đăng xuất', 'POST', '/auth/logout', 204, { token: newUserToken });

  await call('FR-07 quên mật khẩu', 'POST', '/auth/forgot-password', 202, {
    body: { email: EMAIL.student },
  });

  await call('FR-07 token hết hạn', 'POST', '/auth/reset-password', 400, {
    body: { token: RESET_TOKEN_EXPIRED, new_password: 'MatKhauMoi123!' },
    expectCode: 'RESET_TOKEN_EXPIRED',
  });

  await call('FR-07 đặt lại mật khẩu', 'POST', '/auth/reset-password', 200, {
    body: { token: RESET_TOKEN_VALID, new_password: 'MatKhauMoi123!' },
  });

  // ======================================================== 2. Users (4) + Organizer (1)
  await call('FR-05 hồ sơ của tôi', 'GET', '/users/me', 200, { token: studentToken });

  await call('FR-06 cập nhật hồ sơ', 'PATCH', '/users/me', 200, {
    token: org1Token,
    body: {
      bio: 'Cập nhật bởi smoke test',
      social_links: { facebook: 'https://facebook.com/smoke', zalo: 'https://zalo.me/smoke' },
    },
  });

  await call('FR-42 phản hồi đã gửi', 'GET', '/users/me/feedbacks?page=1&limit=10', 200, {
    token: studentToken,
    expectPagination: true,
  });

  await call('FR-17 vé của tôi', 'GET', '/users/me/tickets?page=1&limit=10', 200, {
    token: studentToken,
    expectPagination: true,
  });

  await call('FR-33 hồ sơ công khai BTC', 'GET', `/organizers/${U.org1}`, 200);

  // ======================================================== 3. Events (19)
  await call('FR-13 danh sách sự kiện', 'GET', '/events?page=1&limit=5', 200, {
    expectPagination: true,
  });

  await call('FR-13 lọc sai category', 'GET', '/events?category=khong_ton_tai', 400, {
    expectCode: 'VALIDATION_ERROR',
  });

  const createEventRes = await call('FR-08 tạo sự kiện', 'POST', '/events', 201, {
    token: org1Token,
    body: {
      title: 'Sự kiện Smoke Test',
      description: 'Sự kiện do bộ kiểm thử tự động tạo.',
      location: 'Phòng thử nghiệm',
      location_type: 'in_person',
      category: 'seminar_workshop',
      club_name: 'CLB Công nghệ Thông tin',
      start_time: new Date(Date.now() + 40 * 86400_000).toISOString(),
      end_time: new Date(Date.now() + 40 * 86400_000 + 3 * 3600_000).toISOString(),
      max_tickets: 50,
    },
  });
  const myEventId: string = createEventRes.json?.data?.event?.id;

  await call('BR-30 in_person thiếu location', 'POST', '/events', 400, {
    token: org1Token,
    body: {
      title: 'Thiếu địa điểm',
      location_type: 'in_person',
      start_time: new Date(Date.now() + 86400_000).toISOString(),
      end_time: new Date(Date.now() + 90000_000).toISOString(),
      max_tickets: 10,
    },
    expectCode: 'VALIDATION_ERROR',
  });

  await call('FR-09 chi tiết sự kiện', 'GET', `/events/${E.future}`, 200);
  await call('FR-09 sự kiện không tồn tại', 'GET', '/events/5eed0002-0000-4000-8000-999999999999', 404, {
    expectCode: 'EVENT_NOT_FOUND',
  });

  await call('FR-10 sửa sự kiện', 'PATCH', `/events/${myEventId}`, 200, {
    token: org1Token,
    body: { title: 'Sự kiện Smoke Test (đã sửa)', max_tickets: 60 },
  });

  await call('FR-10 không phải chủ sự kiện', 'PATCH', `/events/${E.ownedByOrg2}`, 403, {
    token: org1Token,
    body: { title: 'Cố sửa sự kiện người khác' },
    expectCode: 'FORBIDDEN_NOT_OWNER',
  });

  await call('FR-12 sự kiện của tôi', 'GET', '/events/mine?page=1&limit=10', 200, {
    token: org1Token,
    expectPagination: true,
  });

  // --- Lịch trình (4)
  await call('FR-32 xem lịch trình', 'GET', `/events/${E.future}/schedule`, 200);

  const schedRes = await call('FR-32 thêm mốc lịch trình', 'POST', `/events/${myEventId}/schedule`, 201, {
    token: org1Token,
    body: {
      start_time: new Date(Date.now() + 40 * 86400_000).toISOString(),
      title: 'Khai mạc',
      location: 'Sảnh chính',
      sort_order: 1,
    },
  });
  const scheduleId: string = schedRes.json?.data?.schedule_item?.id;

  await call('FR-32 sửa mốc lịch trình', 'PATCH', `/events/${myEventId}/schedule/${scheduleId}`, 200, {
    token: org1Token,
    body: { title: 'Khai mạc (đã sửa)' },
  });

  await call('FR-32 xoá mốc lịch trình', 'DELETE', `/events/${myEventId}/schedule/${scheduleId}`, 204, {
    token: org1Token,
  });

  // --- Thông báo (4)
  await call('FR-31 xem thông báo', 'GET', `/events/${E.future}/updates?page=1&limit=5`, 200, {
    expectPagination: true,
  });

  const updateRes = await call('FR-31 đăng thông báo', 'POST', `/events/${myEventId}/updates`, 201, {
    token: org1Token,
    body: { title: 'Thông báo thử nghiệm', content: 'Nội dung thông báo do smoke test tạo.' },
  });
  const updateId: string = updateRes.json?.data?.update?.id;

  await call('BR-40b sửa thông báo', 'PATCH', `/events/${myEventId}/updates/${updateId}`, 200, {
    token: org1Token,
    body: { content: 'Nội dung đã được cập nhật.' },
  });

  await call('BR-40c xoá thông báo', 'DELETE', `/events/${myEventId}/updates/${updateId}`, 204, {
    token: org1Token,
  });

  // --- Co-host (5)
  await call('FR-37 danh sách co-host', 'GET', `/events/${myEventId}/co-hosts`, 200, {
    token: org1Token,
  });

  await call('FR-37 mời co-host', 'POST', `/events/${myEventId}/co-hosts`, 201, {
    token: org1Token,
    body: { user_id: U.org2 },
  });

  await call('BR-45b tự mời chính mình', 'POST', `/events/${myEventId}/co-hosts`, 422, {
    token: org1Token,
    body: { user_id: U.org1 },
    expectCode: 'CANNOT_INVITE_SELF',
  });

  await call('BR-46d chấp nhận lời mời', 'PATCH', `/events/${myEventId}/co-hosts/me/accept`, 200, {
    token: org2Token,
  });

  await call('BR-46d từ chối lời mời', 'PATCH', `/events/${E.onlineFuture}/co-hosts/me/decline`, 200, {
    token: org2Token,
  });

  await call('FR-37 gỡ co-host', 'DELETE', `/events/${myEventId}/co-hosts/${U.org2}`, 204, {
    token: org1Token,
  });

  // ======================================================== 4. Đăng ký & vé
  // --- LUỒNG BẤT ĐỒNG BỘ #1: đăng ký → poll → vé phát ra
  const regRes = await call('FR-14 đăng ký sự kiện', 'POST', `/events/${E.onlineFuture}/registrations`, 202, {
    token: studentToken,
  });
  const registrationId: string = regRes.json?.data?.registration_id;

  let regStatus = regRes.json?.data?.status;
  let polls = 0;
  while (regStatus !== 'confirmed' && regStatus !== 'failed' && polls < 20) {
    await sleep(400);
    polls += 1;
    const response = await fetch(`${BASE}/registrations/${registrationId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const body: any = await response.json();
    regStatus = body?.data?.registration?.status ?? body?.data?.status;
  }
  results.push({
    n: ++counter,
    label: '⚡ LUỒNG ASYNC: đăng ký → worker xác nhận',
    method: 'POLL',
    path: `/registrations/${registrationId.slice(0, 8)}…`,
    expected: 'confirmed',
    actual: `${regStatus} (sau ${polls} lần poll)`,
    pass: regStatus === 'confirmed',
    notes: regStatus === 'confirmed' ? [] : [`worker không xác nhận sau ${polls} lần poll`],
  });

  await call('FR-15 tra cứu đăng ký', 'GET', `/registrations/${registrationId}`, 200, {
    token: studentToken,
  });

  const myTicketsRes = await call('FR-17 vé sau khi đăng ký', 'GET', '/users/me/tickets?page=1&limit=50', 200, {
    token: studentToken,
    expectPagination: true,
  });
  const issuedTicket = (myTicketsRes.json?.data?.tickets ?? []).find(
    (t: any) => t.registration_id === registrationId
  );
  results.push({
    n: ++counter,
    label: '⚡ LUỒNG ASYNC: vé được phát ra',
    method: 'CHECK',
    path: '/users/me/tickets',
    expected: 'có vé cho đăng ký vừa tạo',
    actual: issuedTicket ? `ticket ${String(issuedTicket.id).slice(0, 8)}… status=${issuedTicket.status}` : 'không thấy vé',
    pass: Boolean(issuedTicket) && issuedTicket.status === 'valid',
    notes: issuedTicket ? [] : ['worker chưa sinh vé'],
  });

  // jwt_code KHÔNG được lộ ra JSON (đã sửa ở Giai đoạn 1)
  results.push({
    n: ++counter,
    label: 'C2 jwt_code không lộ trong response vé',
    method: 'CHECK',
    path: '/users/me/tickets',
    expected: 'không có field jwt_code',
    actual: issuedTicket && 'jwt_code' in issuedTicket ? 'CÓ jwt_code' : 'không có',
    pass: !(issuedTicket && 'jwt_code' in issuedTicket),
    notes: issuedTicket && 'jwt_code' in issuedTicket ? ['jwt_code vẫn bị trả ra'] : [],
  });

  await call('FR-18 chi tiết vé + QR', 'GET', `/tickets/${T.scan}`, 200, {
    token: student9Token,
  });

  await call('FR-18 vé của người khác', 'GET', `/tickets/${T.scan}`, 404, {
    token: studentToken,
    expectCode: 'TICKET_NOT_FOUND',
  });

  // --- Ca lỗi: SOLD_OUT
  await call('❗ SOLD_OUT', 'POST', `/events/${E.soldOut}/registrations`, 409, {
    token: student9Token,
    expectCode: 'SOLD_OUT',
  });

  // --- Ca lỗi: DUPLICATE_REGISTRATION qua Idempotency-Key (§1.7)
  // Dùng sự kiện VỪA TẠO trong bộ test: student9 chắc chắn chưa có đăng ký nào ở đó, nên
  // 409 nhận được chỉ có thể đến từ cơ chế Idempotency-Key. Nếu dùng sự kiện seed mà
  // student9 đã có đăng ký active, cả hai request đều bị chặn bởi ràng buộc trùng đăng ký
  // và phép thử không còn chứng minh được điều gì về §1.7.
  const idemKey = `smoke-${Date.now()}`;
  const [dupA, dupB] = await Promise.all([
    fetch(`${BASE}/events/${myEventId}/registrations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${student9Token}`, 'Idempotency-Key': idemKey },
    }),
    fetch(`${BASE}/events/${myEventId}/registrations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${student9Token}`, 'Idempotency-Key': idemKey },
    }),
  ]);
  const dupStatuses = [dupA.status, dupB.status].sort();
  const dupBody: any = await (dupA.status === 409 ? dupA : dupB).json();
  results.push({
    n: ++counter,
    label: '❗ DUPLICATE_REGISTRATION (Idempotency-Key)',
    method: 'POST',
    path: '/events/:id/registrations ×2 song song',
    expected: '202 + 409 DUPLICATE_REGISTRATION',
    actual: `${dupStatuses.join(' + ')} ${dupBody?.error?.code ?? ''}`,
    pass:
      dupStatuses[0] === 202 &&
      dupStatuses[1] === 409 &&
      dupBody?.error?.code === 'DUPLICATE_REGISTRATION',
    notes:
      dupStatuses[0] === 202 && dupStatuses[1] === 409 ? [] : [`nhận ${dupStatuses.join('+')}`],
  });

  await call('FR-34 tự huỷ đăng ký', 'POST', `/registrations/${registrationId}/cancel`, 200, {
    token: studentToken,
  });

  await call('FR-34 huỷ lần hai', 'POST', `/registrations/${registrationId}/cancel`, 422, {
    token: studentToken,
    expectCode: 'REGISTRATION_NOT_CANCELLABLE',
  });

  // FR-41 danh sách người tham gia
  await call('FR-41 người đăng ký', 'GET', `/events/${E.past}/registrations?page=1&limit=10`, 200, {
    token: org1Token,
    expectPagination: true,
  });

  // ======================================================== 5. Check-in (4)
  // Lấy qr_token thật từ endpoint chi tiết vé của chính chủ vé
  const ticketDetail = await fetch(`${BASE}/tickets/${T.scan}`, {
    headers: { Authorization: `Bearer ${student9Token}` },
  });
  const ticketBody: any = await ticketDetail.json();
  const qrDataUrl: string = ticketBody?.data?.qr_code_data_url ?? '';
  results.push({
    n: ++counter,
    label: 'FR-18 qr_code_data_url là ảnh PNG base64',
    method: 'CHECK',
    path: '/tickets/:id',
    expected: 'data:image/png;base64,…',
    actual: qrDataUrl.slice(0, 22) || '(rỗng)',
    pass: qrDataUrl.startsWith('data:image/png;base64,'),
    notes: qrDataUrl.startsWith('data:image/png;base64,') ? [] : ['không phải data URL PNG'],
  });

  // jwt_code lấy trực tiếp từ CSDL qua ioredis? Không — dùng đúng đường người dùng thật:
  // quét bằng token đọc từ bảng tickets thông qua script seed đã ký. Ở đây lấy qua pg.
  const { Client } = await import('pg');
  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();
  const jwtRows = await pg.query<{ id: string; jwt_code: string }>(
    `SELECT id, jwt_code FROM tickets WHERE id = ANY($1::uuid[])`,
    [[T.scan, T.expired]]
  );
  await pg.end();
  const qrToken = jwtRows.rows.find((r) => r.id === T.scan)?.jwt_code ?? '';
  const expiredToken = jwtRows.rows.find((r) => r.id === T.expired)?.jwt_code ?? '';

  const scanRes = await call('FR-19/20 quét QR hợp lệ', 'POST', `/events/${E.ongoing}/checkin/scan`, 200, {
    token: org1Token,
    body: { qr_token: qrToken },
  });
  results.push({
    n: ++counter,
    label: 'FR-20 result=valid ở lần quét đầu',
    method: 'CHECK',
    path: '/events/:id/checkin/scan',
    expected: 'valid',
    actual: scanRes.json?.data?.result ?? '-',
    pass: scanRes.json?.data?.result === 'valid',
    notes: scanRes.json?.data?.result === 'valid' ? [] : ['kết quả quét không phải valid'],
  });

  const scan2 = await call('BR-91 quét lại cùng vé', 'POST', `/events/${E.ongoing}/checkin/scan`, 200, {
    token: org1Token,
    body: { qr_token: qrToken },
  });
  results.push({
    n: ++counter,
    label: '❗ ALREADY_CHECKED_IN (quét lần 2)',
    method: 'CHECK',
    path: '/events/:id/checkin/scan',
    expected: 'already_checked_in',
    actual: scan2.json?.data?.result ?? '-',
    pass: scan2.json?.data?.result === 'already_checked_in',
    notes: scan2.json?.data?.result === 'already_checked_in' ? [] : ['không chốt được khoá BR-91'],
  });

  const scanExpired = await call('BR-99 quét vé quá hạn', 'POST', `/events/${E.past}/checkin/scan`, 200, {
    token: org1Token,
    body: { qr_token: expiredToken },
  });
  results.push({
    n: ++counter,
    label: 'BR-99 result=expired_ticket',
    method: 'CHECK',
    path: '/events/:id/checkin/scan',
    expected: 'expired_ticket',
    actual: scanExpired.json?.data?.result ?? '-',
    pass: scanExpired.json?.data?.result === 'expired_ticket',
    notes: scanExpired.json?.data?.result === 'expired_ticket' ? [] : ['vé quá hạn không bị nhận diện'],
  });

  // --- Ca lỗi: EVENT_NOT_IN_PERSON (quét QR vào sự kiện online)
  await call('❗ EVENT_NOT_IN_PERSON', 'POST', `/events/${E.onlineNow}/checkin/scan`, 422, {
    token: org1Token,
    body: { qr_token: qrToken },
    expectCode: 'EVENT_NOT_IN_PERSON',
  });

  await call('FR-21 lịch sử check-in', 'GET', `/events/${E.past}/checkins?page=1&limit=10`, 200, {
    token: org1Token,
    expectPagination: true,
  });

  const csvRes = await call('FR-22 xuất CSV', 'GET', `/events/${E.past}/checkins/export`, 200, {
    token: org1Token,
    raw: true,
  });
  // CSV theo RFC 4180: có BOM UTF-8 dẫn đầu (để Excel đọc đúng tiếng Việt), mọi ô bọc
  // nháy kép, xuống dòng CRLF — nên không so sánh chuỗi thô mà bóc BOM rồi mới đối chiếu.
  const csvFirstLine = csvRes.text.replace(/^﻿/, '').split('\r\n')[0] ?? '';
  const csvHeaderOk =
    csvRes.text.startsWith('﻿') &&
    csvFirstLine.startsWith('"Ho ten","Email","Ma ve"');
  results.push({
    n: ++counter,
    label: 'FR-22 CSV đúng RFC 4180 + BOM',
    method: 'CHECK',
    path: '/events/:id/checkins/export',
    expected: 'BOM + "Ho ten","Email","Ma ve",…',
    actual: `${csvRes.text.startsWith('﻿') ? 'BOM + ' : 'THIẾU BOM + '}${csvFirstLine.slice(0, 34)}`,
    pass: csvHeaderOk,
    notes: csvHeaderOk ? [] : ['CSV không đúng định dạng'],
  });

  // FR-36 tự check-in sự kiện ONLINE đang trong cửa sổ
  await call('FR-36 tự check-in online', 'POST', `/tickets/${T.selfCheckin}/self-checkin`, 200, {
    token: studentToken,
  });

  await call('❗ ALREADY_CHECKED_IN (tự check-in lần 2)', 'POST', `/tickets/${T.selfCheckin}/self-checkin`, 409, {
    token: studentToken,
    expectCode: 'ALREADY_CHECKED_IN',
  });

  // --- Ca lỗi: SELF_CHECKIN_WINDOW_CLOSED — vé của sự kiện ONLINE nhưng còn 5 ngày nữa
  const windowTicket = (myTicketsRes.json?.data?.tickets ?? []).find(
    (t: any) => t.event?.id === E.onlineFuture
  );
  if (windowTicket) {
    await call('❗ SELF_CHECKIN_WINDOW_CLOSED', 'POST', `/tickets/${windowTicket.id}/self-checkin`, 422, {
      token: studentToken,
      expectCode: 'SELF_CHECKIN_WINDOW_CLOSED',
    });
  } else {
    results.push({
      n: ++counter,
      label: '❗ SELF_CHECKIN_WINDOW_CLOSED',
      method: 'POST',
      path: '/tickets/:id/self-checkin',
      expected: '422 SELF_CHECKIN_WINDOW_CLOSED',
      actual: 'không dựng được vé thử',
      pass: false,
      notes: ['không tìm thấy vé của sự kiện online tương lai'],
    });
  }

  // ======================================================== 6. Feedback (4)
  // student9 vừa được check-in vào E.ongoing ⇒ đủ điều kiện BR-67 cho sự kiện đó
  await call('FR-23 gửi phản hồi', 'POST', `/events/${E.ongoing}/feedbacks`, 201, {
    token: student9Token,
    body: { rating: 5, content: 'Nội dung seminar rất hữu ích, diễn giả trình bày dễ hiểu.' },
  });

  await call('BR-70 phản hồi trùng', 'POST', `/events/${E.ongoing}/feedbacks`, 409, {
    token: student9Token,
    body: { rating: 4 },
    expectCode: 'DUPLICATE_FEEDBACK',
  });

  // --- Ca lỗi: NOT_ATTENDED — chưa từng check-in sự kiện này.
  // Body PHẢI hợp lệ: Zod chạy trước service nên body rỗng sẽ dừng ở 400 VALIDATION_ERROR
  // và không bao giờ chạm tới guard BR-67.
  await call('❗ NOT_ATTENDED', 'POST', `/events/${E.future}/feedbacks`, 422, {
    token: studentToken,
    body: { rating: 5, content: 'Chưa từng tham dự sự kiện này.' },
    expectCode: 'NOT_ATTENDED',
  });

  await call('B1 RATING_REQUIRED', 'POST', `/events/${E.ongoing}/feedbacks`, 400, {
    token: student9Token,
    body: { content: 'Quên chấm sao' },
    expectCode: 'RATING_REQUIRED',
  });

  await call('B1 CONTENT_TOO_LONG', 'POST', `/events/${E.ongoing}/feedbacks`, 400, {
    token: student9Token,
    body: { rating: 4, content: 'a'.repeat(501) },
    expectCode: 'CONTENT_TOO_LONG',
  });

  await call('FR-24 danh sách phản hồi', 'GET', `/events/${E.past}/feedbacks?page=1&limit=10`, 200, {
    token: org1Token,
    expectPagination: true,
  });

  // --- LUỒNG BẤT ĐỒNG BỘ #2: phân tích cảm xúc → summary đổi số
  const before = await call('FR-28 tổng hợp phản hồi (trước)', 'GET', `/events/${E.past}/feedbacks/summary`, 200, {
    token: org1Token,
  });
  const beforeAnalyzed =
    (before.json?.data?.sentiment_breakdown?.positive ?? 0) +
    (before.json?.data?.sentiment_breakdown?.negative ?? 0) +
    (before.json?.data?.sentiment_breakdown?.neutral ?? 0);

  await call('FR-25 kích hoạt phân tích', 'POST', `/events/${E.past}/feedbacks/analyze`, 202, {
    token: org1Token,
  });

  let afterAnalyzed = beforeAnalyzed;
  let sentimentPolls = 0;
  while (afterAnalyzed === beforeAnalyzed && sentimentPolls < 30) {
    await sleep(1000);
    sentimentPolls += 1;
    const response = await fetch(`${BASE}/events/${E.past}/feedbacks/summary`, {
      headers: { Authorization: `Bearer ${org1Token}` },
    });
    const body: any = await response.json();
    afterAnalyzed =
      (body?.data?.sentiment_breakdown?.positive ?? 0) +
      (body?.data?.sentiment_breakdown?.negative ?? 0) +
      (body?.data?.sentiment_breakdown?.neutral ?? 0);
  }
  results.push({
    n: ++counter,
    label: '⚡ LUỒNG ASYNC: Gemini phân tích → summary đổi số',
    method: 'POLL',
    path: '/events/:id/feedbacks/summary',
    expected: `số phản hồi đã gán nhãn > ${beforeAnalyzed}`,
    actual: `${beforeAnalyzed} → ${afterAnalyzed} (sau ${sentimentPolls}s)`,
    pass: afterAnalyzed > beforeAnalyzed,
    notes: afterAnalyzed > beforeAnalyzed ? [] : ['worker phân tích không cập nhật kết quả'],
  });

  // ======================================================== 7. Dashboard (1)
  await call('FR-27/28 dashboard sự kiện', 'GET', `/events/${E.past}/dashboard`, 200, {
    token: org1Token,
  });

  // ======================================================== 8. Admin (5)
  await call('FR-39 tra cứu người dùng', 'GET', '/admin/users?page=1&limit=10', 200, {
    token: adminToken,
    expectPagination: true,
  });

  await call('FR-39 tra cứu sự kiện', 'GET', '/admin/events?page=1&limit=10&status=cancelled', 200, {
    token: adminToken,
    expectPagination: true,
  });

  await call('FR-29 bật lại tài khoản', 'PATCH', `/admin/users/${U.disabled}/status`, 200, {
    token: adminToken,
    body: { is_active: true },
  });

  await call('FR-29 vô hiệu hoá lại', 'PATCH', `/admin/users/${U.disabled}/status`, 200, {
    token: adminToken,
    body: { is_active: false },
  });

  // --- Ca lỗi: CANNOT_DISABLE_ADMIN
  const adminMe = await fetch(`${BASE}/users/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminId: string = (await adminMe.json())?.data?.user?.id;
  await call('❗ CANNOT_DISABLE_ADMIN', 'PATCH', `/admin/users/${adminId}/status`, 403, {
    token: adminToken,
    body: { is_active: false },
    expectCode: 'CANNOT_DISABLE_ADMIN',
  });

  await call('FR-38 cấp tài khoản BTC', 'POST', '/admin/organizers', 201, {
    token: adminToken,
    body: {
      name: 'CLB Smoke Test',
      email: `btc.smoke.${Date.now()}@seed.unievent.local`,
      club_name: 'CLB Smoke Test',
    },
  });

  await call('FR-30 buộc huỷ sự kiện', 'POST', `/admin/events/${E.ownedByOrg2}/force-cancel`, 200, {
    token: adminToken,
    body: { reason: 'Buộc huỷ bởi bộ kiểm thử tự động để xác minh luồng FR-30.' },
  });

  await call('FR-30 huỷ sự kiện đã huỷ', 'POST', `/admin/events/${E.ownedByOrg2}/force-cancel`, 409, {
    token: adminToken,
    body: { reason: 'Thử huỷ lần hai để kiểm mã lỗi trùng trạng thái.' },
    expectCode: 'EVENT_ALREADY_CANCELLED',
  });

  await call('FR-30 thiếu lý do huỷ', 'POST', `/admin/events/${E.future}/force-cancel`, 422, {
    token: adminToken,
    body: { reason: 'ngắn' },
    expectCode: 'CANCEL_REASON_REQUIRED',
  });

  await call('CBR 4 không phải admin', 'GET', '/admin/users', 403, {
    token: studentToken,
    expectCode: 'FORBIDDEN',
  });

  // ======================================================== 9. Upload (1)
  const okForm = new FormData();
  okForm.append('file', new Blob([new Uint8Array(PNG_1X1)], { type: 'image/png' }), 'pixel.png');
  const uploadRes = await call('FR-40 tải ảnh lên Cloudinary', 'POST', '/uploads/image', 201, {
    token: org1Token,
    form: okForm,
  });
  results.push({
    n: ++counter,
    label: 'FR-40 trả URL Cloudinary thật',
    method: 'CHECK',
    path: '/uploads/image',
    expected: 'https://res.cloudinary.com/…',
    actual: String(uploadRes.json?.data?.url ?? '').slice(0, 45) || '(rỗng)',
    pass: String(uploadRes.json?.data?.url ?? '').startsWith('https://res.cloudinary.com/'),
    notes: String(uploadRes.json?.data?.url ?? '').startsWith('https://res.cloudinary.com/')
      ? []
      : ['không phải URL Cloudinary'],
  });

  // --- Ca lỗi: FILE_TOO_LARGE (> MAX_UPLOAD_SIZE_MB)
  const bigForm = new FormData();
  const oversized = Buffer.concat([
    PNG_1X1,
    Buffer.alloc(Math.ceil(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) + 1024, 0),
  ]);
  bigForm.append('file', new Blob([new Uint8Array(oversized)], { type: 'image/png' }), 'big.png');
  await call('❗ FILE_TOO_LARGE', 'POST', '/uploads/image', 413, {
    token: org1Token,
    form: bigForm,
    expectCode: 'FILE_TOO_LARGE',
  });

  const badTypeForm = new FormData();
  badTypeForm.append('file', new Blob([Buffer.from('khong phai anh')], { type: 'text/plain' }), 'a.txt');
  await call('BR-104 sai định dạng', 'POST', '/uploads/image', 422, {
    token: org1Token,
    form: badTypeForm,
    expectCode: 'INVALID_FILE_TYPE',
  });

  // ======================================================== 10. Huỷ sự kiện (đóng luồng FR-11)
  await call('FR-11 huỷ sự kiện', 'POST', `/events/${myEventId}/cancel`, 200, {
    token: org1Token,
    body: { reason: 'Huỷ bởi bộ kiểm thử tự động sau khi đã xác minh xong các luồng liên quan.' },
  });

  await call('❗ EVENT_ALREADY_STARTED', 'POST', `/events/${E.past}/cancel`, 422, {
    token: org1Token,
    body: { reason: 'Thử huỷ sự kiện đã kết thúc để kiểm ràng buộc BR-37b.' },
    expectCode: 'EVENT_ALREADY_STARTED',
  });

  // ======================================================== 11. Xác thực chung
  await call('§1.4 thiếu token', 'GET', '/users/me', 401, { expectCode: 'UNAUTHORIZED' });
  await call('§1.4 token rác', 'GET', '/users/me', 401, {
    token: 'khong-phai-jwt',
    expectCode: 'UNAUTHORIZED',
  });
  await call('404 endpoint không tồn tại', 'GET', '/khong-ton-tai', 404, {
    expectCode: 'NOT_FOUND',
  });

  printReport();
};

const printReport = (): void => {
  const failed = results.filter((r) => !r.pass);

  console.log('');
  console.log('='.repeat(120));
  console.log('KẾT QUẢ KIỂM THỬ ĐẦU-CUỐI');
  console.log('='.repeat(120));

  const w = {
    n: 4,
    label: Math.max(...results.map((r) => r.label.length)),
    method: 6,
    path: Math.min(46, Math.max(...results.map((r) => r.path.length))),
    exp: Math.max(...results.map((r) => r.expected.length)),
  };
  const pad = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1)}…` : s + ' '.repeat(n - s.length);

  console.log(
    `${pad('#', w.n)} ${pad('KẾT QUẢ', 8)} ${pad('LUỒNG', w.label)} ${pad('METHOD', w.method)} ${pad('ĐƯỜNG DẪN', w.path)} ${pad('MONG ĐỢI', w.exp)} THỰC TẾ`
  );
  console.log('-'.repeat(120));
  for (const r of results) {
    console.log(
      `${pad(String(r.n), w.n)} ${pad(r.pass ? '✅ PASS' : '❌ FAIL', 8)} ${pad(r.label, w.label)} ${pad(r.method, w.method)} ${pad(r.path, w.path)} ${pad(r.expected, w.exp)} ${r.actual}`
    );
  }

  console.log('');
  console.log(`TỔNG: ${results.length - failed.length}/${results.length} PASS`);

  if (failed.length > 0) {
    console.log('');
    console.log('CHI TIẾT CÁC CA HỎNG:');
    for (const r of failed) {
      console.log(`  #${r.n} ${r.label} — ${r.method} ${r.path}`);
      for (const note of r.notes) console.log(`      · ${note}`);
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
};

void main().catch((error: unknown) => {
  console.error('❌ Bộ kiểm thử dừng giữa chừng:', error);
  printReport();
});
