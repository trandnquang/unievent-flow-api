/**
 * Kiểm tra tài liệu OpenAPI phục vụ tại GET /api-docs.json.
 *
 * Chạy: `npm run check:openapi` (cần `npm run dev` đang sống)
 *
 * Ba lớp kiểm, cùng triết lý với `npm run smoke`:
 *   1. Cấu trúc  — openapi 3.x, servers[0].url = '/api/v1', path KHÔNG lẫn tiền tố /api/v1
 *   2. Wire format — quét MỌI tên field trong `properties`/`required` của mọi schema, bắt
 *      bất kỳ khoá camelCase nào. Quy ước đã chốt là snake_case toàn hệ thống (CLAUDE.md).
 *   3. Swagger UI  — GET /api-docs trả 200 và đúng là trang Swagger UI
 *
 * Chỉ soi TÊN FIELD nghiệp vụ, không soi từ khoá cấu trúc của chính OpenAPI (`requestBody`,
 * `securitySchemes`, `additionalProperties`... đều là camelCase hợp lệ theo đặc tả OpenAPI).
 * Cách phân biệt: chỉ thu tên field từ object `properties` và mảng `required` — không dùng
 * danh sách trắng, vì danh sách trắng sẽ mục nát khi các nhóm endpoint sau được đăng ký.
 *
 * Exit code khác 0 khi có bất kỳ phát hiện nào, để dùng được trong CI.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { env } from '../src/config/env';

const ORIGIN = `http://localhost:${env.PORT}`;

// Tổng chốt ở api_spec.md mục 11: 51 endpoint REST nghiệp vụ + GET /health = 52 operation,
// trải trên 42 path key (nhiều path gộp 2 method, vd /users/me có get+patch).
const EXPECTED_PATH_KEYS = 42;
const EXPECTED_OPERATIONS = 52;

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'];

// === Nguồn kỳ vọng: ĐỌC THẲNG src/routes/*.ts DƯỚI DẠNG VĂN BẢN ==============
//
// Vì sao KHÔNG introspect router lúc chạy: Express 5 đã bỏ `app._router`, và `Layer` không
// còn phơi `regexp` — chỉ còn `matchers` (mảng hàm) — nên KHÔNG lấy lại được prefix mount của
// router con. Ngoài ra `import` bất kỳ file route nào sẽ kéo theo config/redis + config/queues,
// tức là mở kết nối ioredis/BullMQ chỉ để chạy một phép kiểm tài liệu.
//
// Đọc văn bản không cần import gì, chạy được cả khi Redis/PostgreSQL đang tắt, và TỰ CẬP NHẬT
// khi ai đó thêm route mới — không còn danh sách cứng nào để mục nát.

const ROUTES_DIR = join(__dirname, '..', 'src', 'routes');

interface RouteOp {
  method: string;
  path: string;
  secured: boolean;
}

// Bỏ chú thích TRƯỚC khi quét. Bắt buộc, không phải làm cho đẹp: chính file
// src/routes/organizer.routes.ts có một comment cảnh báo chứa nguyên văn chuỗi
// `router.use(requireAuth, …)`, và bộ quét văn bản đã "đọc" cảnh báo đó rồi kết luận nhầm
// rằng cả file bị khoá bởi guard cấp router — khiến GET /organizers/:userId (vốn PUBLIC theo
// BR-27) bị báo là thiếu khai báo bearerAuth. Bộ quét văn bản KHÔNG được đọc chú thích.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Cắt đúng danh sách tham số của một lời gọi router.xxx(...) bằng cách đếm ngoặc cân bằng.
// Regex thuần KHÔNG làm được: các lời gọi trải nhiều dòng và sẽ nuốt sang route kế tiếp.
const sliceCallArgs = (source: string, openParenIndex: number): string => {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) {
      return source.slice(openParenIndex + 1, i);
    }
  }
  return '';
};

const collectRouteOps = (): RouteOp[] => {
  const indexSource = stripComments(
    readFileSync(join(ROUTES_DIR, 'index.ts'), 'utf8')
  );

  const moduleFileByIdentifier = new Map<string, string>();
  for (const m of indexSource.matchAll(
    /import\s+(\w+)\s+from\s+'\.\/([\w.]+)'/g
  )) {
    moduleFileByIdentifier.set(m[1]!, `${m[2]}.ts`);
  }

  const ops: RouteOp[] = [];
  for (const m of indexSource.matchAll(
    /router\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g
  )) {
    const prefix = m[1]!;
    const file = moduleFileByIdentifier.get(m[2]!);
    if (!file) continue;

    const source = stripComments(readFileSync(join(ROUTES_DIR, file), 'utf8'));
    // Guard cấp router: `router.use(requireAuth, requireActive)` áp cho MỌI route trong file
    const routerLevelAuth = /router\.use\(\s*requireAuth\b/.test(source);

    const callRe = new RegExp(`router\\.(${HTTP_METHODS.join('|')})\\(`, 'g');
    let call: RegExpExecArray | null;
    while ((call = callRe.exec(source)) !== null) {
      const args = sliceCallArgs(source, call.index + call[0].length - 1);
      const routePath = args.match(/^\s*'([^']*)'/)?.[1] ?? '';
      ops.push({
        method: call[1]!,
        // ':eventId' -> '{eventId}': đúng dạng path template của OpenAPI, VÀ giữ nguyên tên
        // tham số nên hai bên so khớp trực tiếp, không cần bảng quy đổi snake/camel nào.
        path: (prefix + (routePath === '/' ? '' : routePath)).replace(
          /:(\w+)/g,
          '{$1}'
        ),
        secured: routerLevelAuth || /\brequireAuth\b/.test(args),
      });
    }
  }

  // GET /health sống ở src/app.ts, NGOÀI cây router /api/v1 — thêm tay.
  ops.push({ method: 'get', path: '/health', secured: false });

  return ops;
};

const failures: string[] = [];
const passes: string[] = [];

const check = (ok: boolean, label: string, detail = ''): void => {
  if (ok) passes.push(label);
  else failures.push(detail ? `${label} — ${detail}` : label);
};

// Cùng regex với findCamelCaseKeys trong scripts/smoke.ts
const isCamelCase = (key: string): boolean => /[a-z0-9][A-Z]/.test(key);

// Thu mọi tên field nghiệp vụ: khoá của object `properties` và phần tử của mảng `required`.
//
// LƯU Ý: tham số đường dẫn (eventId, ticketId…) KHÔNG bị quét — chúng nằm ở `parameters[].name`,
// không nằm trong `properties` hay `required`. Đây là CHỦ Ý: `{eventId}` chỉ là placeholder
// trong URL template, không bao giờ đi trên dây; giữ đúng tên tham số Express khiến path key
// của tài liệu khớp byte-to-byte với src/routes/*.routes.ts, và đó chính là cơ sở cho phép
// đối chiếu route ↔ tài liệu ở mục 1b.
const collectFieldNames = (
  node: unknown,
  trail: string,
  out: Map<string, string>
): void => {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectFieldNames(item, `${trail}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;

  const properties = record['properties'];
  if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
    for (const field of Object.keys(properties)) {
      if (!out.has(field)) out.set(field, `${trail}.properties.${field}`);
    }
  }

  const required = record['required'];
  if (Array.isArray(required)) {
    for (const field of required) {
      if (typeof field === 'string' && !out.has(field)) {
        out.set(field, `${trail}.required`);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    collectFieldNames(child, trail ? `${trail}.${key}` : key, out);
  }
};

const main = async (): Promise<void> => {
  // --- 1. Cấu trúc ----------------------------------------------------------
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/api-docs.json`);
  } catch (error) {
    console.error(
      `❌ Không gọi được ${ORIGIN}/api-docs.json — API có đang chạy không? (npm run dev)`
    );
    console.error(error);
    process.exit(1);
  }

  check(response.status === 200, 'GET /api-docs.json trả 200', `nhận ${response.status}`);

  const doc = (await response.json()) as Record<string, any>;

  const version = typeof doc['openapi'] === 'string' ? doc['openapi'] : '';
  check(/^3\.\d+\.\d+$/.test(version), 'openapi là 3.x hợp lệ', `nhận "${version}"`);
  check(
    typeof doc['info']?.title === 'string' && typeof doc['info']?.version === 'string',
    'có info.title và info.version'
  );

  const serverUrl = doc['servers']?.[0]?.url;
  check(serverUrl === '/api/v1', "servers[0].url = '/api/v1'", `nhận "${serverUrl}"`);

  const paths = (doc['paths'] ?? {}) as Record<string, Record<string, unknown>>;
  const pathKeys = Object.keys(paths);

  const prefixed = pathKeys.filter((p) => p.startsWith('/api/v1'));
  check(
    prefixed.length === 0,
    'không path nào lẫn tiền tố /api/v1 (tránh double-prefix)',
    prefixed.join(', ')
  );

  // --- 1b. Đối chiếu HAI CHIỀU route Express ↔ tài liệu ----------------------
  const routeOps = collectRouteOps();

  const docOps = new Set<string>();
  for (const [p, item] of Object.entries(paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) docOps.add(`${method} ${p}`);
    }
  }

  // (1) Mọi route THẬT đều phải có mặt trong tài liệu
  const missing = routeOps
    .map((op) => `${op.method} ${op.path}`)
    .filter((key) => !docOps.has(key));
  check(
    missing.length === 0,
    `mọi route Express đều đã đăng ký (${routeOps.length} route)`,
    missing.join(' · ')
  );

  // (2) Không operation MA trong tài liệu (đã đăng ký nhưng route không còn tồn tại)
  const routeKeys = new Set(routeOps.map((op) => `${op.method} ${op.path}`));
  const orphan = [...docOps].filter((key) => !routeKeys.has(key));
  check(
    orphan.length === 0,
    'không operation nào trong tài liệu thiếu route tương ứng',
    orphan.join(' · ')
  );

  // (3) Chốt số lượng — bắt ca "quên import file *.paths.ts mới vào src/docs/index.ts",
  //     thứ mà hai phép kiểm trên KHÔNG bắt được nếu ai đó xoá cả route lẫn tài liệu.
  check(
    pathKeys.length === EXPECTED_PATH_KEYS,
    `đúng ${EXPECTED_PATH_KEYS} path key (41 nghiệp vụ + /health)`,
    `nhận ${pathKeys.length}`
  );
  check(
    docOps.size === EXPECTED_OPERATIONS,
    `đúng ${EXPECTED_OPERATIONS} operation (api_spec.md mục 11)`,
    `nhận ${docOps.size}`
  );

  // (4) security bearerAuth khớp HAI CHIỀU với guard requireAuth trong mã nguồn route
  for (const op of routeOps) {
    const operation = paths[op.path]?.[op.method] as
      | { security?: Record<string, unknown>[] }
      | undefined;
    if (!operation) continue; // đã báo ở phép kiểm (1)
    const hasBearer =
      operation.security?.some((entry) => 'bearerAuth' in entry) ?? false;
    check(
      hasBearer === op.secured,
      `${op.method.toUpperCase()} ${op.path} — security ${op.secured ? 'CÓ' : 'KHÔNG'} bearerAuth`,
      `route ${op.secured ? 'có' : 'không'} requireAuth nhưng tài liệu ${hasBearer ? 'có' : 'không'} khai`
    );
  }

  // (5) GET /health nằm ở host GỐC, ngoài tiền tố /api/v1 -> phải ghi đè servers ở cấp
  //     operation, nếu không Swagger UI sẽ gọi /api/v1/health (404).
  const healthServers = (
    paths['/health']?.['get'] as { servers?: { url: string }[] } | undefined
  )?.servers;
  check(
    healthServers?.[0]?.url === '/',
    "GET /health ghi đè servers: [{ url: '/' }]",
    `nhận ${JSON.stringify(healthServers)}`
  );

  check(
    doc['components']?.securitySchemes?.bearerAuth?.scheme === 'bearer',
    'components.securitySchemes.bearerAuth là http bearer JWT'
  );

  // --- 2. Wire format snake_case -------------------------------------------
  const fields = new Map<string, string>();
  collectFieldNames(doc['components']?.schemas, 'components.schemas', fields);
  collectFieldNames(doc['paths'], 'paths', fields);

  const camel = [...fields.entries()].filter(([field]) => isCamelCase(field));
  check(
    camel.length === 0,
    `0 field camelCase (đã quét ${fields.size} tên field)`,
    camel.map(([field, where]) => `${field} @ ${where}`).join(' · ')
  );

  // --- 3. Swagger UI --------------------------------------------------------
  const ui = await fetch(`${ORIGIN}/api-docs/`);
  const uiBody = await ui.text();
  check(ui.status === 200, 'GET /api-docs trả 200', `nhận ${ui.status}`);
  check(uiBody.includes('swagger-ui'), 'GET /api-docs trả trang Swagger UI');

  // --- Tổng kết -------------------------------------------------------------
  for (const label of passes) console.log(`✅ ${label}`);
  for (const label of failures) console.log(`❌ ${label}`);

  const total = passes.length + failures.length;
  console.log(
    `\n${failures.length === 0 ? '✅' : '❌'} ${passes.length}/${total} phép kiểm PASS · ${pathKeys.length} path đã đăng ký`
  );

  process.exit(failures.length === 0 ? 0 : 1);
};

void main();
