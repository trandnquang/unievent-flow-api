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
import { env } from '../src/config/env';

const ORIGIN = `http://localhost:${env.PORT}`;

// Nhóm endpoint đã đăng ký tính tới lượt này (api_spec.md mục 2 — Auth & Account).
// Các nhóm sau bổ sung path của mình vào đây khi đăng ký.
const EXPECTED_PATHS: Record<string, string[]> = {
  '/auth/register': ['post'],
  '/auth/login': ['post'],
  '/auth/logout': ['post'],
  '/auth/forgot-password': ['post'],
  '/auth/reset-password': ['post'],
  '/auth/change-password': ['post'],
  '/users/me': ['get', 'patch'],
};

// Route yêu cầu đăng nhập -> phải khai báo security bearerAuth (api_spec.md mục 1.4)
const SECURED: [string, string][] = [
  ['/auth/logout', 'post'],
  ['/auth/change-password', 'post'],
  ['/users/me', 'get'],
  ['/users/me', 'patch'],
];

const failures: string[] = [];
const passes: string[] = [];

const check = (ok: boolean, label: string, detail = ''): void => {
  if (ok) passes.push(label);
  else failures.push(detail ? `${label} — ${detail}` : label);
};

// Cùng regex với findCamelCaseKeys trong scripts/smoke.ts
const isCamelCase = (key: string): boolean => /[a-z0-9][A-Z]/.test(key);

// Thu mọi tên field nghiệp vụ: khoá của object `properties` và phần tử của mảng `required`.
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

  for (const [expectedPath, methods] of Object.entries(EXPECTED_PATHS)) {
    for (const method of methods) {
      check(
        typeof paths[expectedPath]?.[method] === 'object',
        `có ${method.toUpperCase()} ${expectedPath}`
      );
    }
  }

  const prefixed = pathKeys.filter((p) => p.startsWith('/api/v1'));
  check(
    prefixed.length === 0,
    'không path nào lẫn tiền tố /api/v1 (tránh double-prefix)',
    prefixed.join(', ')
  );

  for (const [securedPath, method] of SECURED) {
    const operation = paths[securedPath]?.[method] as
      | { security?: Record<string, unknown>[] }
      | undefined;
    const hasBearer = operation?.security?.some((entry) => 'bearerAuth' in entry) ?? false;
    check(hasBearer, `${method.toUpperCase()} ${securedPath} yêu cầu bearerAuth`);
  }

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
