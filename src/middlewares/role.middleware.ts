//backend/src/middlewares/role.middleware.ts


import { Response, NextFunction } from "express";
import { Request } from "express";
import { Role } from "../constants/roles";

export const requireRole = (role: Role) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};