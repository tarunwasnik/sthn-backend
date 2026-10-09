import { createHash } from "node:crypto";
import { ulid } from "ulid";
import sharp from "sharp";
import { Types } from "mongoose";
import { IMAGE_MODERATION_SURFACES, ImageModerationSurface } from "../../enums/imageModeration.enums";
import { adamCoddImageSafetyService, AdamCoddImageSafetyService } from "./adamCoddImageSafety.service";
import { imageAdmissionService, ImageAdmissionService } from "./imageAdmission.service";
import { deleteTemporaryImageFromCloudinary, uploadTemporaryImageToCloudinary } from "../../utils/uploadToCloudinary";

export class ImageTemporaryUploadError extends Error { constructor(readonly code: "INVALID_SURFACE" | "FORBIDDEN_SURFACE" | "INVALID_IMAGE" | "UPLOAD_FAILED" | "PERSISTENCE_FAILED", message: string) { super(message); } }
const creatorOwnedSurface = (surface: ImageModerationSurface) => surface === "CREATOR_PROFILE_AVATAR" || surface === "CREATOR_PROFILE_COVER" || surface === "CREATOR_PROFILE_MEDIA" || surface === "CREATOR_SERVICE_MEDIA";
const validateBytes = async (bytes: Buffer) => { if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported."); const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: 16_777_216, pages: 1, animated: false }).metadata(); if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || metadata.width * metadata.height > 16_777_216 || (metadata.pages && metadata.pages !== 1)) throw new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported."); };
export class ImageTemporaryUploadService {
  constructor(private readonly admission: ImageAdmissionService = imageAdmissionService, private readonly classifier: AdamCoddImageSafetyService = adamCoddImageSafetyService, private readonly upload = uploadTemporaryImageToCloudinary, private readonly destroy = deleteTemporaryImageFromCloudinary) {}
  async submit(input: { actorId: Types.ObjectId; role: string; surface: unknown; bytes: Buffer }) {
    if (typeof input.surface !== "string" || !(IMAGE_MODERATION_SURFACES as readonly string[]).includes(input.surface)) throw new ImageTemporaryUploadError("INVALID_SURFACE", "Invalid image target.");
    const surface = input.surface as ImageModerationSurface;
    if (creatorOwnedSurface(surface) && input.role !== "creator") throw new ImageTemporaryUploadError("FORBIDDEN_SURFACE", "You cannot upload media for this target.");
    try { await validateBytes(input.bytes); } catch (error) { if (error instanceof ImageTemporaryUploadError) throw error; throw new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported."); }
    const contentSha256 = createHash("sha256").update(input.bytes).digest("hex"); const entityBinding = `PENDING:${input.actorId.toString()}:${surface}`; let publicId: string | null = null; let registered = false;
    try {
      const uploaded = await this.upload(input.bytes, `ima_${ulid()}`); publicId = uploaded.public_id;
      const asset = await this.admission.registerTrustedTemporaryAsset({ actorId: input.actorId, contentSha256, providerAssetId: publicId, trustedMediaReference: uploaded.secure_url }); registered = true;
      const attempt = await this.admission.createAttempt({ assetId: asset._id, actorId: input.actorId, contentSha256, surface, entityBinding });
      const result = await this.classifier.classify(input.bytes);
      const recorded = await this.admission.recordDecision({ attemptReference: attempt.attemptReference, decision: result.decision, invalidInput: result.reasonCode === "INVALID_IMAGE" });
      if (!recorded) throw new ImageTemporaryUploadError("PERSISTENCE_FAILED", "Image moderation could not be completed. Please try again.");
      if (result.decision === "PASS" && recorded.admission) return { decision: "PASS" as const, attemptReference: attempt.attemptReference, admissionReference: recorded.admission.admissionReference, assetReference: asset.assetReference, expiresAt: recorded.admission.expiresAt, message: "Image approved for this upload step." };
      return { decision: result.decision, attemptReference: attempt.attemptReference, assetReference: asset.assetReference, message: result.decision === "BLOCK" ? "This image cannot be used because it does not meet the platform image policy. Please choose a different image." : "Image moderation is temporarily unavailable. Please try again." };
    } catch (error) { if (publicId && !registered) await this.destroy(publicId).catch(() => undefined); if (error instanceof ImageTemporaryUploadError) throw error; throw new ImageTemporaryUploadError("UPLOAD_FAILED", "Image upload could not be completed. Please try again."); }
  }
}
export const imageTemporaryUploadService = new ImageTemporaryUploadService();
