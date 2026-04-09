// backend/src/routes/profile.routes.ts

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";

import { protect } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import {
  upsertProfile,
  getMyProfile,
} from "../controllers/profile.controller";

const router = Router();

/* ================= GET PROFILE ================= */

router.get("/me", protect, getMyProfile);

/* ================= CREATE / UPDATE PROFILE ================= */

router.post(
  "/me",
  protect,

  // ✅ Multer wrapper to catch errors BEFORE Express crashes
  (req: Request, res: Response, next: NextFunction) => {
    upload.array("profilePhotos", 6)(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      } else if (err) {
        return res.status(500).json({
          success: false,
          message: "File upload failed",
        });
      }
      next();
    });
  },

  upsertProfile
);

export default router;