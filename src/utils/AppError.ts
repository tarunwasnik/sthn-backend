//backend/src/utils/AppError.ts

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  readonly code?: string;

  constructor(message: string, statusCode = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}
