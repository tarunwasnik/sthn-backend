// backend/src/utils/uploadToCloudinary.ts

import cloudinary from "../config/cloudinary";

/**
 * Upload buffer to Cloudinary
 * @param buffer - file buffer
 * @param folder - target folder (user_profiles | creator_profiles | creator_services)
 */
export const uploadToCloudinary = (
  buffer: Buffer,
  folder: "user_profiles" | "creator_profiles" | "creator_services"
): Promise<{ secure_url: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder, // ✅ dynamic folder
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          secure_url: result?.secure_url || "",
        });
      }
    );

    stream.end(buffer);
  });
};