//backend/src/middlewares/errorHandler.ts

import { Request, Response, NextFunction } from "express";
import multer from "multer";

type RequestError = Error & {
  body?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

const multerClientErrorStatuses: Record<string, number> = {
  LIMIT_FILE_SIZE: 413,
  LIMIT_FIELD_VALUE: 413,
  LIMIT_FILE_COUNT: 400,
  LIMIT_FIELD_COUNT: 400,
  LIMIT_PART_COUNT: 400,
  LIMIT_UNEXPECTED_FILE: 400,
  LIMIT_FIELD_KEY: 400,
  MISSING_FIELD_NAME: 400,
  LIMIT_FIELD_NESTING: 400,
  LIMIT_FIELD_ARRAY_INDEX: 400,
};

const isMalformedJsonError = (error: RequestError) =>
  error.type === "entity.parse.failed" ||
  (error instanceof SyntaxError && error.status === 400 && typeof error.body === "string");

const isMalformedMultipartError = (error: RequestError) =>
  error.message === "Multipart: Boundary not found" || error.message === "Unexpected end of form";

const toRequestError = (error: unknown): RequestError =>
  error instanceof Error ? error as RequestError : new Error("Server error");

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const error = toRequestError(err);
  const code = typeof error.code === "string" ? error.code : undefined;
  const multerStatus = code ? multerClientErrorStatuses[code] : undefined;
  const isMulterError = error instanceof multer.MulterError || multerStatus !== undefined;
  const malformedJson = isMalformedJsonError(error);
  const malformedMultipart = isMalformedMultipartError(error);
  const statusCode = malformedJson || malformedMultipart
    ? 400
    : multerStatus ?? (typeof error.statusCode === "number" ? error.statusCode : 500);
  const message = malformedJson
    ? "Invalid JSON request body"
    : malformedMultipart
      ? "Malformed multipart request"
      : error.message || "Server error";
  const responseCode = malformedJson
    ? "INVALID_JSON"
    : malformedMultipart
      ? "MALFORMED_MULTIPART"
      : code;
  const category = malformedJson
    ? "json-parse"
    : malformedMultipart
      ? "multipart-parse"
      : isMulterError
        ? "multer"
        : statusCode < 500
          ? "application"
          : "internal";

  // Do not serialize error/request objects: parser errors can contain raw bodies
  // and Multer errors can contain uploaded-file metadata or buffers.
  console.error("Request failed", { category, code: responseCode, statusCode });

  res.status(statusCode).json({
    success: false,
    message,
    ...(responseCode ? { code: responseCode } : {}),
  });
};
