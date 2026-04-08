// backend/src/middlewares/auth.middleware.ts

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { Role } from "../constants/roles";

interface JwtPayload {
  id: string;
  role: Role;
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as JwtPayload;

    // Always trust DB for authoritative state
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Account suspended. Contact support.",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        message: "Account permanently banned.",
      });
    }

    // Attach full lifecycle-aware user
    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};