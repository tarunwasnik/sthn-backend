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

export const uploadTemporaryImageToCloudinary = (buffer: Buffer, publicId: string): Promise<CloudinaryUploadResult> => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ folder: "image_ai_temporary", public_id: publicId, resource_type: "image", type: "upload", overwrite: false, unique_filename: false, tags: ["sthn-image-ai-temporary"] }, (error, result) => {
    if (error || !result) return reject(error ?? new Error("Temporary image upload failed"));
    resolve({ secure_url: result.secure_url, public_id: result.public_id, resource_type: result.resource_type, bytes: result.bytes, format: result.format, original_filename: result.original_filename });
  });
  stream.end(buffer);
});

export const deleteTemporaryImageFromCloudinary = (publicId: string) => cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload", invalidate: true });

export type TemporaryImageDeletionOutcome = "DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "AMBIGUOUS_FAILURE";

/**
 * The provider call remains non-transactional. Callers must reserve durable
 * ownership before invoking it and must contain ambiguous outcomes.
 */
export const deleteCloudinaryImageSafely = async (publicId: string): Promise<TemporaryImageDeletionOutcome> => {
  try {
    const result = await deleteTemporaryImageFromCloudinary(publicId);
    if (result?.result === "ok") return "DELETED";
    if (result?.result === "not found") return "ALREADY_MISSING";
    return "AMBIGUOUS_FAILURE";
  } catch (error) {
    const status = typeof error === "object" && error !== null && "http_code" in error
      ? Number((error as { http_code?: unknown }).http_code)
      : 0;
    if (status === 408 || status === 429 || status >= 500) return "RETRYABLE_FAILURE";
    return "AMBIGUOUS_FAILURE";
  }
};

/** Compatibility alias for temporary-media callers. */
export const deleteTemporaryImageFromCloudinarySafely = deleteCloudinaryImageSafely;
