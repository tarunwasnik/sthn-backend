// backend/src/utils/uploadToCloudinary.ts

import cloudinary from "../config/cloudinary";

export type CloudinaryFolder =
  | "user_profiles"
  | "creator_profiles"
  | "creator_services"
  | "chat_documents"
  | "chat_images"
  | "chat_videos"
  | "chat_voice";

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  format: string;
  original_filename: string;
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: CloudinaryFolder,
  resourceType: "auto" | "image" | "video" | "raw" = "auto"
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(
            new Error("Cloudinary upload failed.")
          );
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          bytes: result.bytes,
          format: result.format,
          original_filename:
            result.original_filename,
        });
      }
    );

    stream.end(buffer);
  });
};