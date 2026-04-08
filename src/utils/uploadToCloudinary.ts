// backend/src/utils/uploadToCloudinary.ts

import cloudinary from "../config/cloudinary";

export const uploadToCloudinary = (
  buffer: Buffer
): Promise<{ secure_url: string }> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "user_profiles" },
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