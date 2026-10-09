import { ClientSession, Types } from "mongoose";
import { ImageAdmission } from "../models/imageAdmission.model";
import { ImageModerationAsset } from "../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../models/imageModerationAttempt.model";
import { ImageModerationAttemptStatus, ImageModerationFailureKind, ImageModerationSurface } from "../enums/imageModeration.enums";

export class ImageModerationRepository {
  resolveAdmissionReferenceInSession(admissionReference: string, session: ClientSession) { return ImageAdmission.findOne({ admissionReference }).session(session).exec(); }
  async resolveAdmissionReferenceForPreflight(input: { admissionReference: string; actorId: Types.ObjectId; expectedSurface: ImageModerationSurface; now: Date }) {
    const admission = await ImageAdmission.findOne({ admissionReference: input.admissionReference, actorId: input.actorId, surface: input.expectedSurface, status: "ACTIVE", expiresAt: { $gt: input.now } }).exec();
    if (!admission) return null;
    const attempt = await ImageModerationAttempt.findOne({ _id: admission.attemptId, actorId: input.actorId, assetId: admission.assetId, contentSha256: admission.contentSha256, surface: input.expectedSurface, entityBinding: admission.entityBinding, status: "PASSED" }).exec();
    if (!attempt) return null;
    const asset = await ImageModerationAsset.findOne({ _id: admission.assetId, actorId: input.actorId, contentSha256: admission.contentSha256, status: "TEMPORARY", expiresAt: { $gt: input.now } }).exec();
    return asset ? { admission, attempt, asset } : null;
  }
  createAsset(input: Parameters<typeof ImageModerationAsset.create>[0]) { return ImageModerationAsset.create(input); }
  createAttempt(input: Parameters<typeof ImageModerationAttempt.create>[0]) { return ImageModerationAttempt.create(input); }
  findActiveAsset(input: { assetId: Types.ObjectId; actorId: Types.ObjectId; contentSha256: string; now: Date }) { return ImageModerationAsset.findOne({ _id: input.assetId, actorId: input.actorId, contentSha256: input.contentSha256, status: "TEMPORARY", expiresAt: { $gt: input.now } }).exec(); }
  markProcessing(attemptReference: string) { return ImageModerationAttempt.findOneAndUpdate({ attemptReference, status: "CREATED" }, { $set: { status: "PROCESSING" } }, { new: true, runValidators: true }).exec(); }
  resolveAttempt(input: { attemptReference: string; status: Extract<ImageModerationAttemptStatus, "PASSED" | "BLOCKED" | "UNAVAILABLE" | "INVALID">; failureKind?: ImageModerationFailureKind; now: Date }) { return ImageModerationAttempt.findOneAndUpdate({ attemptReference: input.attemptReference, status: { $in: ["CREATED", "PROCESSING"] } }, { $set: { status: input.status, decidedAt: input.now, ...(input.failureKind ? { failureKind: input.failureKind } : {}) } }, { new: true, runValidators: true }).exec(); }
  createAdmission(input: Parameters<typeof ImageAdmission.create>[0]) { return ImageAdmission.create(input); }
  consume(input: { admissionReference: string; actorId: Types.ObjectId; assetId: Types.ObjectId; contentSha256: string; surface: ImageModerationSurface; entityBinding: string; committedReference: string; now: Date }) { return ImageAdmission.findOneAndUpdate({ admissionReference: input.admissionReference, actorId: input.actorId, assetId: input.assetId, contentSha256: input.contentSha256, surface: input.surface, entityBinding: input.entityBinding, status: "ACTIVE", expiresAt: { $gt: input.now } }, { $set: { status: "CONSUMED", consumedAt: input.now, committedReference: input.committedReference } }, { new: true, runValidators: true }).exec(); }
  invalidateForReplacement(input: { actorId: Types.ObjectId; surface: ImageModerationSurface; entityBinding: string; now: Date }) { return ImageAdmission.updateMany({ actorId: input.actorId, surface: input.surface, entityBinding: input.entityBinding, status: "ACTIVE" }, { $set: { status: "INVALIDATED", invalidatedAt: input.now } }).exec(); }
  async consumePendingInSession(input: { session: ClientSession; admissionReference: string; actorId: Types.ObjectId; assetId: Types.ObjectId; contentSha256: string; surface: ImageModerationSurface; pendingBinding: string; destinationBinding: string; now: Date }) {
    if (!input.session?.inTransaction()) throw new ImageAdmissionTransactionError("IMAGE_ADMISSION_TRANSACTION_REQUIRED");
    const admission = await ImageAdmission.findOneAndUpdate({ admissionReference: input.admissionReference, actorId: input.actorId, assetId: input.assetId, contentSha256: input.contentSha256, surface: input.surface, entityBinding: input.pendingBinding, status: "ACTIVE", expiresAt: { $gt: input.now } }, { $set: { status: "CONSUMED", consumedAt: input.now, committedReference: input.destinationBinding } }, { new: true, session: input.session, runValidators: true }).exec();
    if (!admission) throw new ImageAdmissionTransactionError("IMAGE_ADMISSION_NOT_ACTIVE");
    const attempt = await ImageModerationAttempt.findOne({ _id: admission.attemptId, status: "PASSED", actorId: input.actorId, assetId: input.assetId, contentSha256: input.contentSha256, surface: input.surface }).session(input.session).exec();
    const asset = attempt && await ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, actorId: input.actorId, contentSha256: input.contentSha256, status: "TEMPORARY", expiresAt: { $gt: input.now } }, { $set: { status: "COMMITTED", committedAt: input.now, committedEntityBinding: input.destinationBinding } }, { new: true, session: input.session, runValidators: true }).exec();
    if (!attempt) throw new ImageAdmissionTransactionError("IMAGE_ADMISSION_ATTEMPT_NOT_PASSED");
    if (!asset) throw new ImageAdmissionTransactionError("IMAGE_ADMISSION_ASSET_NOT_PROMOTABLE");
    return { admission, asset };
  }
}
export class ImageAdmissionTransactionError extends Error { constructor(readonly code: "IMAGE_ADMISSION_TRANSACTION_REQUIRED" | "IMAGE_ADMISSION_NOT_ACTIVE" | "IMAGE_ADMISSION_ATTEMPT_NOT_PASSED" | "IMAGE_ADMISSION_ASSET_NOT_PROMOTABLE") { super(code); this.name = "ImageAdmissionTransactionError"; } }
export const imageModerationRepository = new ImageModerationRepository();
