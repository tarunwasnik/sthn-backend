import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ulid } from "ulid";
import sharp, { Metadata } from "sharp";
import { Types } from "mongoose";
import { IMAGE_MODERATION_SURFACES, ImageModerationSurface } from "../../enums/imageModeration.enums";
import { imageAdmissionService, IMAGE_AI_V1_POLICY, ImageAdmissionService } from "./imageAdmission.service";
import { ADAMCODD_IMAGE_SAFETY_LIMITS } from "./adamCoddImageSafety.config";
import { adamCoddV2ImageSafetyService, AdamCoddV2ImageSafetyService } from "./adamCoddV2ImageSafety.service";
import { deleteTemporaryImageFromCloudinary, uploadTemporaryImageToCloudinary } from "../../utils/uploadToCloudinary";

type ImageValidationFailure = "EMPTY" | "TOO_LARGE" | "DECODE_FAILED" | "DIMENSIONS_EXCEEDED" | "MULTI_PAGE";
type DecoderDiagnostic = Readonly<{ name: string; message: string }>;

export class ImageTemporaryUploadError extends Error {
  constructor(
    readonly code: "INVALID_SURFACE" | "FORBIDDEN_SURFACE" | "INVALID_IMAGE" | "PROCESSING_UNAVAILABLE" | "UPLOAD_FAILED" | "PERSISTENCE_FAILED",
    message: string,
    readonly validationFailure?: ImageValidationFailure,
    readonly decoderDiagnostic?: DecoderDiagnostic,
  ) { super(message); }
}

const creatorOwnedSurface = (surface: ImageModerationSurface) => surface === "CREATOR_PROFILE_AVATAR" || surface === "CREATOR_PROFILE_COVER" || surface === "CREATOR_PROFILE_MEDIA" || surface === "CREATOR_SERVICE_MEDIA";
const boundedDiagnosticName = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || "Error";
const boundedDiagnosticMessage = (value: string) => value.replace(/(?:[a-zA-Z]:\\|\/)[^\s]*/g, "[path]").replace(/[\r\n\t]+/g, " ").trim().slice(0, 240) || "Decoder rejected the input.";
const decoderDiagnostic = (error: unknown): DecoderDiagnostic => {
  if (error instanceof Error) return { name: boundedDiagnosticName(error.name), message: boundedDiagnosticMessage(error.message) };
  return { name: "UnknownError", message: "Decoder rejected the input." };
};
const invalidImage = (validationFailure: ImageValidationFailure, diagnostic?: DecoderDiagnostic) => new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported.", validationFailure, diagnostic);
const imageAdmissionDiagnosticsEnabled = () => process.env.NODE_ENV === "development" && process.env.STHN_IMAGE_ADMISSION_DIAGNOSTICS === "true";
const reportTiming = (reference: string, stage: string, durationMs: number) => {
  if (!imageAdmissionDiagnosticsEnabled()) return;
  console.info("[image-admission] timing", { reference, stage, durationMs: Number(durationMs.toFixed(1)) });
};
/** Validates actual image bytes before provider upload or moderation inference. */
export const validateImageAdmissionBytes = async (bytes: Buffer): Promise<void> => {
  if (!bytes.length) throw invalidImage("EMPTY");
  if (bytes.length > ADAMCODD_IMAGE_SAFETY_LIMITS.maxBytes) throw invalidImage("TOO_LARGE");
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, { failOn: "error", limitInputPixels: ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels, pages: 1, animated: false }).metadata();
  } catch (error) {
    throw invalidImage("DECODE_FAILED", decoderDiagnostic(error));
  }
  if (!metadata.width || !metadata.height
    || metadata.width > ADAMCODD_IMAGE_SAFETY_LIMITS.maxWidth
    || metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxHeight
    || metadata.width * metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels) throw invalidImage("DIMENSIONS_EXCEEDED");
  if (metadata.pages && metadata.pages !== 1) throw invalidImage("MULTI_PAGE");
};

const reportValidationFailure = (surface: ImageModerationSurface, bytes: Buffer, error: ImageTemporaryUploadError) => {
  if (!imageAdmissionDiagnosticsEnabled() || !error.validationFailure) return;
  console.warn("[image-admission] validation rejected", {
    stage: "BYTE_VALIDATION",
    category: error.validationFailure,
    byteLength: bytes.length,
    surface,
    ...(error.validationFailure === "DECODE_FAILED" && error.decoderDiagnostic ? { decoder: error.decoderDiagnostic } : {}),
  });
};

export class ImageTemporaryUploadService {
  constructor(
    private readonly admission: ImageAdmissionService = imageAdmissionService,
    private readonly classifier: Pick<AdamCoddV2ImageSafetyService, "classify" | "provenance"> = adamCoddV2ImageSafetyService,
    private readonly upload = uploadTemporaryImageToCloudinary,
    private readonly destroy = deleteTemporaryImageFromCloudinary,
  ) {}
  async submit(input: { actorId: Types.ObjectId; role: string; surface: unknown; bytes: Buffer }) {
    const requestStartedAt = performance.now();
    const diagnosticReference = imageAdmissionDiagnosticsEnabled() ? `iad_${ulid()}` : "";
    const timing = (stage: string, durationMs: number) => reportTiming(diagnosticReference, stage, durationMs);
    if (diagnosticReference) console.info("[image-admission] received", { reference: diagnosticReference, byteLength: input.bytes.length });
    if (typeof input.surface !== "string" || !(IMAGE_MODERATION_SURFACES as readonly string[]).includes(input.surface)) throw new ImageTemporaryUploadError("INVALID_SURFACE", "Invalid image target.");
    const surface = input.surface as ImageModerationSurface;
    if (creatorOwnedSurface(surface) && input.role !== "creator") throw new ImageTemporaryUploadError("FORBIDDEN_SURFACE", "You cannot upload media for this target.");
    try { await validateImageAdmissionBytes(input.bytes); timing("VALIDATION", performance.now() - requestStartedAt); } catch (error) {
      if (error instanceof ImageTemporaryUploadError) {
        reportValidationFailure(surface, input.bytes, error);
        throw error;
      }
      throw new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported.");
    }
    const contentSha256 = createHash("sha256").update(input.bytes).digest("hex");
    const entityBinding = `PENDING:${input.actorId.toString()}:${surface}`; let publicId: string | null = null; let registered = false;
    try {
      const uploadStartedAt = performance.now();
      const uploaded = await this.upload(input.bytes, `ima_${ulid()}`); publicId = uploaded.public_id;
      timing("CLOUDINARY_UPLOAD", performance.now() - uploadStartedAt);
      const persistenceStartedAt = performance.now();
      const asset = await this.admission.registerTrustedTemporaryAsset({ actorId: input.actorId, contentSha256, providerAssetId: publicId, trustedMediaReference: uploaded.secure_url }); registered = true;
      const attempt = await this.admission.createAttempt({ assetId: asset._id, actorId: input.actorId, contentSha256, surface, entityBinding, provenance: this.classifier.provenance });
      timing("ATTEMPT_PERSISTENCE", performance.now() - persistenceStartedAt);
      // V1 receives its bounded derivative; V2 receives only validated original bytes.
      const inferenceStartedAt = performance.now();
      const result = await (async () => {
        try {
          return await this.classifier.classify(input.bytes);
        } catch (error) {
          return { decision: "UNAVAILABLE" as const, reasonCode: "IMAGE_SAFETY_UNAVAILABLE" as const };
        }
      })();
      timing("ADAMCODD_CLASSIFICATION", performance.now() - inferenceStartedAt);
      const decisionStartedAt = performance.now();
      const recorded = await this.admission.recordDecision({ attemptReference: attempt.attemptReference, decision: result.decision, invalidInput: result.reasonCode === "INVALID_IMAGE" });
      timing("DECISION_PERSISTENCE", performance.now() - decisionStartedAt);
      if (!recorded) throw new ImageTemporaryUploadError("PERSISTENCE_FAILED", "Image moderation could not be completed. Please try again.");
      if (result.decision === "PASS" && recorded.admission) { timing("TOTAL", performance.now() - requestStartedAt); return { decision: "PASS" as const, attemptReference: attempt.attemptReference, admissionReference: recorded.admission.admissionReference, assetReference: asset.assetReference, expiresAt: recorded.admission.expiresAt, message: "Image approved for this upload step." }; }
      timing("TOTAL", performance.now() - requestStartedAt);
      return { decision: result.decision, attemptReference: attempt.attemptReference, assetReference: asset.assetReference, message: result.decision === "BLOCK" ? "This image cannot be used because it does not meet the platform image policy. Please choose a different image." : "Image moderation is temporarily unavailable. Please try again." };
    } catch (error) { if (publicId && !registered) await this.destroy(publicId).catch(() => undefined); if (error instanceof ImageTemporaryUploadError) throw error; throw new ImageTemporaryUploadError("UPLOAD_FAILED", "Image upload could not be completed. Please try again."); }
  }
}
export const imageTemporaryUploadService = new ImageTemporaryUploadService();
