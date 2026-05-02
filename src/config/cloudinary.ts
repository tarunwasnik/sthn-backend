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
    const parts = url.split("/upload/")[1];

    if (!parts) return null;

    // remove version if exists (v123...)
    const withoutVersion = parts.replace(/^v\d+\//, "");

    // remove file extension
    return withoutVersion.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

export default cloudinary;