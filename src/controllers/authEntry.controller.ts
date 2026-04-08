


//backend/src/controllers/authEntrt.controller.ts
import { Request, Response } from "express";
import { resolveEntry } from "../services/entryResolver.service";

export const authEntry = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const entry = resolveEntry(user);

    return res.status(200).json(entry);
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "Access denied",
    });
  }
};
