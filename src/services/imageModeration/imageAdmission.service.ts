import { ulid } from "ulid";
import { ClientSession, Types } from "mongoose";
import { ADAMCODD_RUNTIME_AUTHORITY } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";
import { ImageModerationSurface } from "../../enums/imageModeration.enums";
import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";
import { ImageAdmission } from "../../models/imageAdmission.model";
import { ImageModerationAsset } from "../../models/imageModerationAsset.model";
import type { FaceVerificationAvatarCandidate } from "../../models/faceVerificationSession.model";
import { imageModerationRepository } from "../../repositories/imageModeration.repository";

const TEMPORARY_ASSET_MS = 48 * 60 * 60 * 1000;
const ATTEMPT_RETENTION_MS = 10 * 24 * 60 * 60 * 1000;
const hash = (value: string) => { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Image moderation content hash is invalid"); return value; };
const binding = (value: string) => { if (!value.trim() || value.length > 200) throw new Error("Image moderation entity binding is invalid"); return value; };
export const IMAGE_AI_V1_POLICY = Object.freeze({ key: "STHN_IMAGE_AI_V1", version: "V1" });
export const validateAdmissionAuthority = (input: { admission: { status: string; actorId: unknown; assetId: unknown; contentSha256: string; surface: string; entityBinding: string; expiresAt: Date }; actorId: unknown; assetId: unknown; contentSha256: string; surface: string; entityBinding: string; now: Date }) => input.admission.status === "ACTIVE" && input.admission.expiresAt > input.now && String(input.admission.actorId) === String(input.actorId) && String(input.admission.assetId) === String(input.assetId) && input.admission.contentSha256 === input.contentSha256 && input.admission.surface === input.surface && input.admission.entityBinding === input.entityBinding;
/** Server-derived authority for a temporary avatar that may be used only as a face-verification candidate. */
export type TrustedAvatarAdmissionCandidate = Readonly<{
  admissionId: Types.ObjectId;
  admissionReference: string;
  attemptId: Types.ObjectId;
  attemptReference: string;
  assetId: Types.ObjectId;
  providerAssetId: string;
  contentSha256: string;
  trustedMediaReference: string;
  expiresAt: Date;
  assetExpiresAt: Date;
}>;
export class ImageAdmissionService {
  async registerTrustedTemporaryAsset(input: { actorId: Types.ObjectId; contentSha256: string; providerAssetId: string; trustedMediaReference: string; now?: Date }) { const now = input.now ?? new Date(); return imageModerationRepository.createAsset({ assetReference: `ima_${ulid()}`, actorId: input.actorId, contentSha256: hash(input.contentSha256), providerAssetId: binding(input.providerAssetId), trustedMediaReference: binding(input.trustedMediaReference), expiresAt: new Date(now.getTime() + TEMPORARY_ASSET_MS), retentionDeadline: new Date(now.getTime() + ATTEMPT_RETENTION_MS) }); }
  async createAttempt(input: { assetId: Types.ObjectId; actorId: Types.ObjectId; contentSha256: string; surface: ImageModerationSurface; entityBinding: string; now?: Date }) { const now = input.now ?? new Date(); const contentSha256 = hash(input.contentSha256); const asset = await imageModerationRepository.findActiveAsset({ assetId: input.assetId, actorId: input.actorId, contentSha256, now }); if (!asset) throw new Error("Trusted temporary image asset is not active for this actor and content"); return imageModerationRepository.createAttempt({ attemptReference: `imat_${ulid()}`, assetId: input.assetId, actorId: input.actorId, contentSha256, surface: input.surface, entityBinding: binding(input.entityBinding), provenanceModel: { identifier: ADAMCODD_RUNTIME_AUTHORITY.repositoryId, revision: ADAMCODD_RUNTIME_AUTHORITY.revision, artifactSha256: ADAMCODD_RUNTIME_AUTHORITY.artifactSha256 }, policy: IMAGE_AI_V1_POLICY, expiresAt: new Date(now.getTime() + TEMPORARY_ASSET_MS), retentionDeadline: new Date(now.getTime() + ATTEMPT_RETENTION_MS) }); }
  async recordDecision(input: { attemptReference: string; decision: "PASS" | "BLOCK" | "UNAVAILABLE"; invalidInput?: boolean; now?: Date }) { const now = input.now ?? new Date(); const status = input.decision === "PASS" ? "PASSED" : input.decision === "BLOCK" ? "BLOCKED" : input.invalidInput ? "INVALID" : "UNAVAILABLE"; const attempt = await imageModerationRepository.resolveAttempt({ attemptReference: input.attemptReference, status, failureKind: status === "INVALID" ? "INVALID_IMAGE" : status === "UNAVAILABLE" ? "MODEL_UNAVAILABLE" : undefined, now }); if (!attempt) return null; if (status !== "PASSED") return { attempt, admission: null }; const admission = await imageModerationRepository.createAdmission({ admissionReference: `imauth_${ulid()}`, attemptId: attempt._id, assetId: attempt.assetId, actorId: attempt.actorId, contentSha256: attempt.contentSha256, surface: attempt.surface, entityBinding: attempt.entityBinding, expiresAt: attempt.expiresAt }); return { attempt, admission }; }
  async consumeAdmission(input: { admissionReference: string; actorId: Types.ObjectId; assetId: Types.ObjectId; contentSha256: string; surface: ImageModerationSurface; entityBinding: string; committedReference: string; now?: Date }) { return imageModerationRepository.consume({ ...input, contentSha256: hash(input.contentSha256), entityBinding: binding(input.entityBinding), committedReference: binding(input.committedReference), now: input.now ?? new Date() }); }
  /** Advisory only: the later entity transaction must independently consume the admission. */
  async resolveAdmissionReferenceForPreflight(input: { admissionReference: string; actorId: Types.ObjectId; expectedSurface: ImageModerationSurface; now?: Date }): Promise<{ trustedMediaReference: string }> {
    const resolved = await imageModerationRepository.resolveAdmissionReferenceForPreflight({ ...input, now: input.now ?? new Date() });
    if (!resolved) throw new Error("Image admission reference is not eligible for preflight");
    return { trustedMediaReference: resolved.asset.trustedMediaReference };
  }
  /**
   * Resolves, but never consumes or reserves, the exact passed temporary
   * USER_PROFILE_AVATAR admission for a future face-verification session.
   * This is server-only authority; controllers must not accept its media
   * reference from a client.
   */
  async resolveTrustedAvatarAdmissionCandidate(input: { admissionReference: string; actorId: Types.ObjectId; now?: Date }): Promise<TrustedAvatarAdmissionCandidate> {
    const resolved = await imageModerationRepository.resolveAdmissionReferenceForPreflight({
      admissionReference: input.admissionReference,
      actorId: input.actorId,
      expectedSurface: "USER_PROFILE_AVATAR",
      now: input.now ?? new Date(),
    });
    if (!resolved) throw new Error("Avatar image admission is not eligible for face verification");
    return {
      admissionId: resolved.admission._id,
      admissionReference: resolved.admission.admissionReference,
      attemptId: resolved.attempt._id,
      attemptReference: resolved.attempt.attemptReference,
      assetId: resolved.asset._id,
      providerAssetId: resolved.asset.providerAssetId,
      contentSha256: resolved.admission.contentSha256,
      trustedMediaReference: resolved.asset.trustedMediaReference,
      expiresAt: resolved.admission.expiresAt,
      assetExpiresAt: resolved.asset.expiresAt,
    };
  }
  /** Verifies inside a caller-owned transaction that this exact avatar admission was promoted to the avatar slot. */
  async assertConsumedAvatarCandidateInSession(input: { session: ClientSession; actorId: Types.ObjectId; profileId: Types.ObjectId; candidate: Extract<FaceVerificationAvatarCandidate, { kind: "ADMISSION" }>; now?: Date }) {
    if (!input.session?.inTransaction()) throw new Error("Image admission validation requires an active MongoDB transaction");
    const now = input.now ?? new Date();
    const destinationBinding = `USER_PROFILE:${input.profileId.toString()}:avatar`;
    const admission = await imageModerationRepository.resolveAdmissionReferenceInSession(input.candidate.admissionReference, input.session);
    if (!admission
      || String(admission._id) !== String(input.candidate.admissionId)
      || String(admission.assetId) !== String(input.candidate.assetId)
      || admission.actorId.toString() !== input.actorId.toString()
      || admission.contentSha256 !== input.candidate.contentSha256
      || admission.surface !== "USER_PROFILE_AVATAR"
      || admission.status !== "CONSUMED"
      || admission.committedReference !== destinationBinding
      || admission.expiresAt <= now
      || input.candidate.expiresAt <= now) throw new Error("Avatar admission candidate is no longer transactionally eligible");
    const asset = await ImageModerationAsset.findOne({
      _id: input.candidate.assetId,
      actorId: input.actorId,
      contentSha256: input.candidate.contentSha256,
      trustedMediaReference: input.candidate.trustedMediaReference,
      status: "COMMITTED",
      committedEntityBinding: destinationBinding,
    }).session(input.session).exec();
    if (!asset) throw new Error("Avatar admission asset is not promoted for this profile avatar slot");
  }
  /** Caller must resolve destination ownership/slot and invoke this inside its existing session.withTransaction callback. */
  async consumePendingAdmissionInSession(input: { session: ClientSession; admissionReference: string; actorId: Types.ObjectId; assetId: Types.ObjectId; contentSha256: string; surface: ImageModerationSurface; pendingBinding: string; destinationBinding: string; now?: Date }): Promise<{ trustedMediaReference: string }> { if (!input.session?.inTransaction()) throw new Error("Image admission consumption requires an active MongoDB transaction"); const consumed = await imageModerationRepository.consumePendingInSession({ ...input, contentSha256: hash(input.contentSha256), pendingBinding: binding(input.pendingBinding), destinationBinding: binding(input.destinationBinding), now: input.now ?? new Date() }); return { trustedMediaReference: consumed.asset.trustedMediaReference }; }
  /** Caller must have already authorized destination ownership/slot; only its server-derived binding is accepted. */
  async consumeAdmissionReferenceInSession(input: { session: ClientSession; admissionReference: string; actorId: Types.ObjectId; expectedSurface: ImageModerationSurface; destinationBinding: string; now?: Date }): Promise<{ trustedMediaReference: string }> { if (!input.session?.inTransaction()) throw new Error("Image admission consumption requires an active MongoDB transaction"); const admission = await imageModerationRepository.resolveAdmissionReferenceInSession(input.admissionReference, input.session); if (!admission || admission.actorId.toString() !== input.actorId.toString() || admission.surface !== input.expectedSurface || admission.status !== "ACTIVE") throw new Error("Image admission reference is not valid for this actor and surface"); return this.consumePendingAdmissionInSession({ session: input.session, admissionReference: admission.admissionReference, actorId: input.actorId, assetId: admission.assetId, contentSha256: admission.contentSha256, surface: input.expectedSurface, pendingBinding: admission.entityBinding, destinationBinding: input.destinationBinding, now: input.now }); }
  async invalidateForReplacement(input: { actorId: Types.ObjectId; surface: ImageModerationSurface; entityBinding: string; now?: Date }) { return imageModerationRepository.invalidateForReplacement({ ...input, entityBinding: binding(input.entityBinding), now: input.now ?? new Date() }); }
  /** Future controllers must only call consumeAdmission inside their entity-write transaction. */
  async isGrandfatheredUnchangedReference(input: { currentStoredReference: string; submittedReference: string }) { return Boolean(input.currentStoredReference) && input.currentStoredReference === input.submittedReference; }
}
export const imageAdmissionService = new ImageAdmissionService();
