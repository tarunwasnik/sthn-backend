//backend/src/config/cloudinary.ts

import { v2 as cloudinary } from "cloudinary";

/* ================= CONFIG ================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

/* ================= EXTRACT PUBLIC ID ================= */

export const extractPublicId = (url: string) => {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    const publicIdWithExtension = path
      .split("/upload/")[1]
      .split("/")
      .slice(1)
      .join("/");

    return publicIdWithExtension.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

export default cloudinary;