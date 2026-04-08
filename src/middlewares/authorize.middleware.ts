//backend/src/middlewares/authorize.middelware.ts


import { Request, Response, NextFunction } from "express";
import { Role } from "../constants/roles";

export const authorizeRoles =
  (...allowedRoles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };