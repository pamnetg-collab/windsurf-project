export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const BadRequest = (msg: string, code = "bad_request") => new AppError(400, msg, code);
export const Unauthorized = (msg = "Unauthorized", code = "unauthorized") => new AppError(401, msg, code);
export const Forbidden = (msg = "Forbidden", code = "forbidden") => new AppError(403, msg, code);
export const NotFound = (msg = "Not found", code = "not_found") => new AppError(404, msg, code);
export const Conflict = (msg: string, code = "conflict") => new AppError(409, msg, code);
