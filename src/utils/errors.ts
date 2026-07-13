// Lớp lỗi tùy chỉnh chuẩn hoá theo định dạng error envelope của API.md
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown[] | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
