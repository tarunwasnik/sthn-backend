//backend/src/controllers/authEntry.controller.ts
import { Request, Response } from "express";
import { resolveEntry } from "../services/entryResolver.service";
import { UserProfile } from "../models/userProfile.model";

export const authEntry = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const profile = await UserProfile.findOne({ userId: user.id }).select("profileStatus").lean();
    const entry = (profile?.profileStatus === "incomplete" || profile?.profileStatus === "rejected") && user.status === "active" && String(user.role).toLowerCase() !== "admin"
      ? { entryType: "ONBOARDING" as const, entryRoute: "/onboarding", userId: user.id }
      : resolveEntry(user);

    return res.status(200).json(entry);
  } catch (err: any) {
    return res.status(403).json({
      message: err.message || "Access denied",
    });
  }
};
