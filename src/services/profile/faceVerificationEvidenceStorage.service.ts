import cloudinary from "../../config/cloudinary";

export interface FaceEvidenceStoredAsset { publicId: string; bytes: number; format: string; mimeType: string; }

export const storeFaceVerificationEvidence = (input: { buffer: Buffer; publicId: string }): Promise<FaceEvidenceStoredAsset> => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ public_id: input.publicId, resource_type: "image", type: "authenticated", overwrite: false, unique_filename: false, headers: "X-Robots-Tag: noindex" }, (error, result) => {
    if (error || !result) return reject(error ?? new Error("Face evidence upload failed."));
    resolve({ publicId: result.public_id, bytes: result.bytes, format: result.format, mimeType: `image/${result.format}` });
  });
  stream.end(input.buffer);
});

export const deleteFaceVerificationEvidence = async (publicId: string) => {
  try { await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true }); }
  catch { /* Cloudinary deletion is intentionally idempotent for lifecycle cleanup. */ }
};

// Deliberately service-only in Stage 3D. A future Admin detail controller must
// authorize the request/profile relationship before returning this short-lived URL.
export const generateFaceVerificationEvidenceAdminDownloadUrl = (publicId: string, format: string) => cloudinary.utils.private_download_url(publicId, format, {
  resource_type: "image",
  type: "authenticated",
  expires_at: Math.floor(Date.now() / 1000) + 60,
});
