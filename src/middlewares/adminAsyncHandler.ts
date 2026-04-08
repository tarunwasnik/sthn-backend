//backend/src/middlewares/adminAsyncHandler.ts


import { Request, Response, NextFunction } from "express";
import { adminError } from "../utils/adminError";

export const adminAsyncHandler =
  (fn: Function) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (err: any) {
      res.status(500).json(
        adminError(
          err?.message || "Admin dashboard error",
          "ADMIN_INTERNAL_ERROR"
        )
      );
    }
  };