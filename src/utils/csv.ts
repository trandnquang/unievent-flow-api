// Sinh CSV theo RFC 4180 (FR-22, BR-64). Không dùng thư viện ngoài: quy tắc thoát ký tự
// chỉ gồm 2 điều — bọc ô trong dấu nháy kép, và nhân đôi mọi dấu nháy kép bên trong.

// BOM UTF-8. Không có nó, Excel trên Windows đọc file như ANSI và làm vỡ toàn bộ tiếng Việt.
export const UTF8_BOM = '﻿';

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';

  const text = value instanceof Date ? value.toISOString() : String(value);

  // Luôn bọc nháy kép thay vì chỉ bọc khi cần: đơn giản hơn, và tránh sót trường hợp ô
  // chứa dấu phẩy, xuống dòng hoặc chính dấu nháy kép.
  return `"${text.replace(/"/g, '""')}"`;
};

// Ghép header + các dòng dữ liệu thành một chuỗi CSV hoàn chỉnh, đã kèm BOM.
// Dùng CRLF theo đúng RFC 4180 để Excel xuống dòng chuẩn.
export const buildCsv = (
  headers: string[],
  rows: readonly unknown[][]
): string => {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
};
