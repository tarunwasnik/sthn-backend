//backend/src/middlewares/errorHandler.ts

import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("🔥 GLOBAL ERROR HANDLER HIT 🔥");
  console.error("Error message:", err.message);
  console.error("Full error:", err);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    message: err.message || "Server error",
  });
};