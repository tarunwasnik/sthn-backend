import mongoose from "mongoose";
import User from "../../models/User";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { UserProfile } from "../../models/userProfile.model";
import { ROLES } from "../../constants/roles";
import { generateUniqueCreatorSlug } from "../../utils/generateCreatorSlug";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../profile/faceVerification.constants";
import { AppError } from "../../utils/AppError";
import { createAuditLog } from "../auditLog.service";
import { notificationService } from "../notification/notification.service";
import { notificationDeliveryService } from "../notification/notificationDelivery.service";
import { providerAssetReferenceRepository } from "../../repositories/providerAssetReference.repository";
import { providerAssetReferenceTransactionService, TrustedProviderAsset } from "../profile/providerAssetReferenceTransaction.service";
import { fingerprintProfileMediaReference } from "../profile/profileVerificationSubmittedMedia.service";

export type CreatorApplicationDecisionActor =
  | { type: "ADMIN"; id: string }
  | { type: "SYSTEM"; reference: "CREATOR_V3_AUTOMATED_VERIFICATION" };

type CreatorApprovalInput = {
  applicationId: string;
  adminId?: string;
  actor?: CreatorApplicationDecisionActor;
  aiDecisionSnapshot?: { model: { identifier: string; version: string }; similarity: number; threshold: number };
};
type CreatorRejectionInput = CreatorApprovalInput & { reason: unknown; expectedVerification?: { requestId: string; revision: number } };

const resolveDecisionActor = (input: CreatorApprovalInput): CreatorApplicationDecisionActor => {
  if (input.actor) return input.actor;
  if (!input.adminId) throw new AppError("Creator decision actor is required", 500);
  return { type: "ADMIN", id: input.adminId };
};

export const approveCreatorApplicationDecision = async (input: CreatorApprovalInput) => {
  const actor = resolveDecisionActor(input);
  const session = await mongoose.startSession();
  const outcome: { creatorProfile: InstanceType<typeof CreatorProfile> | null; delivery: Awaited<ReturnType<typeof notificationService.createWithOutcome>> | null } = { creatorProfile: null, delivery: null };

  try {
    await session.withTransaction(async () => {
      const application = await CreatorApplication.findById(input.applicationId).session(session);
      if (!application) throw new AppError("Application not found", 404);
      if (application.status !== "submitted") throw new AppError("Application not eligible for approval", 400);

      if (application.applicationJourney === "direct_creator") {
        throw new AppError("Direct Creator applications cannot be approved until an authoritative identity-verification decision is available", 409, "DIRECT_CREATOR_IDENTITY_DECISION_REQUIRED");
      }

      if (!Number.isInteger(application.verificationRevision) || application.verificationRevision < 1) throw new AppError("Creator face verification evidence is required before approval", 409, "CREATOR_FACE_VERIFICATION_REQUIRED");

      const verification = await ProfileVerificationRequest.findOne({ targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, verificationRevision: application.verificationRevision, userId: application.userId, isActive: true, status: { $in: ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED"] }, submittedAt: { $gt: new Date(Date.now() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) } }).session(session);
      const faceSession = verification ? await FaceVerificationSession.findOne({ targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, verificationRevision: application.verificationRevision, verificationRequestId: verification._id, isCurrent: true, status: "CAPTURE_COMPLETE", requiredCaptureCount: 5, acceptedCaptureCount: 5, avatarFingerprint: fingerprintProfileMediaReference(application.avatarUrl ?? "") }).session(session) : null;
      const captures = faceSession && verification ? await FaceVerificationEvidence.find({ sessionId: faceSession._id, verificationRequestId: verification._id, targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, verificationRevision: application.verificationRevision, status: "STORED" }).sort({ challengeIndex: 1 }).session(session) : [];
      if (!verification || !faceSession || verification.profileSubmissionVersion !== application.verificationRevision || faceSession.profileSubmissionVersion !== application.verificationRevision || String(faceSession.userId) !== String(application.userId) || captures.length !== 5 || captures.some((capture, index) => capture.challengeIndex !== index || capture.challenge !== faceSession.challenges[index] || String(capture.userId) !== String(application.userId))) throw new AppError("Creator face verification evidence is required before approval", 409, "CREATOR_FACE_VERIFICATION_REQUIRED");
      const snapshot = verification.submittedMedia;
      if (!snapshot || !application.avatarUrl || !application.coverUrl || snapshot.avatar.sourceReference !== application.avatarUrl || snapshot.avatar.fingerprint !== fingerprintProfileMediaReference(application.avatarUrl) || snapshot.cover.sourceReference !== application.coverUrl || snapshot.cover.fingerprint !== fingerprintProfileMediaReference(application.coverUrl) || snapshot.profilePhotos.length !== (application.media ?? []).length || snapshot.profilePhotos.some((photo, index) => photo.profilePhotoIndex !== index || photo.sourceReference !== application.media?.[index] || photo.fingerprint !== fingerprintProfileMediaReference(application.media?.[index] ?? ""))) throw new AppError("Creator verification submission is stale", 409, "CREATOR_FACE_VERIFICATION_REQUIRED");

      const user = await User.findById(application.userId).session(session);
      if (!user) throw new AppError("User not found", 404);

      const existingProfile = await CreatorProfile.findOne({ userId: application.userId }).session(session);
      if (existingProfile) throw new AppError("Creator profile already exists", 400);

      const userProfile = await UserProfile.findOne({ userId: application.userId }).session(session);
      if (!userProfile || userProfile.profileStatus !== "verified") throw new AppError("User profile required before approval", 400);

      const terminalVerification = await profileVerificationRequestRepository.transitionToTerminal({
        requestId: verification._id,
        decision: "APPROVE",
        authority: actor.type === "SYSTEM" ? "AI" : "ADMIN",
        ...(actor.type === "ADMIN" ? { decidedBy: new mongoose.Types.ObjectId(actor.id) } : {}),
        ...(actor.type === "SYSTEM" && input.aiDecisionSnapshot ? { aiDecisionSnapshot: { source: "AI" as const, ...input.aiDecisionSnapshot, decidedAt: new Date() } } : {}),
        decidedAt: new Date(),
        now: new Date(),
        session,
      });
      if (!terminalVerification) throw new AppError("Creator verification request is no longer eligible for approval", 409);

      const slug = await generateUniqueCreatorSlug(application.displayName);
      const applicationMedia = { avatar: application.avatarUrl ?? null, cover: application.coverUrl ?? null, media: [...(application.media ?? [])] };
      const applicationReferences = await providerAssetReferenceRepository.findCurrentByEntity("CREATOR_APPLICATION", application._id, session);
      const trustedApplicationMedia = new Map<string, TrustedProviderAsset>();

      for (const { slot, reference } of [
        ...(applicationMedia.avatar ? [{ slot: "avatar", reference: applicationMedia.avatar }] : []),
        ...(applicationMedia.cover ? [{ slot: "cover", reference: applicationMedia.cover }] : []),
        ...applicationMedia.media.map((reference, index) => ({ slot: `media:${index}`, reference })),
      ]) {
        const applicationReference = applicationReferences.find((candidate) => candidate.slot === slot);
        if (!applicationReference?.imageModerationAssetId) throw new AppError("Creator application media is not trusted", 400);

        const trusted = await providerAssetReferenceTransactionService.resolveTrustedCommittedAsset({ session, actorId: application.userId, assetId: applicationReference.imageModerationAssetId, destinationBinding: `CREATOR_APPLICATION:${application._id}:${slot}` });
        if (applicationReference.guardId.toString() !== trusted.guardId.toString() || applicationReference.authoritativeReference !== reference || trusted.authoritativeReference !== reference) throw new AppError("Creator application media is not trusted", 400);
        trustedApplicationMedia.set(slot, trusted);
      }

      const creatorProfile = new CreatorProfile({
        userId: application.userId,
        slug,
        displayName: application.displayName,
        avatarUrl: applicationMedia.avatar,
        coverUrl: applicationMedia.cover,
        media: applicationMedia.media,
        ...(application.primaryCategory ? { primaryCategory: application.primaryCategory } : {}),
        categories: application.primaryCategory ? [application.primaryCategory] : [],
        interests: application.interests ?? [],
        bio: application.publicBio,
        languages: application.languages,
        country: application.country,
        city: application.city,
        currency: application.currency,
        rating: 0,
        reviewCount: 0,
        status: "active",
      });
      await creatorProfile.save({ session });

      for (const [slot, trusted] of trustedApplicationMedia) await providerAssetReferenceTransactionService.acquireTrusted({ session, entity: { entityType: "CREATOR_PROFILE", entityId: creatorProfile._id, slot }, trusted });

      user.role = ROLES.CREATOR;
      user.creatorStatus = "approved";
      await user.save({ session });

      application.status = "approved";
      application.rejectionReason = "";
      await application.save({ session });

      await createAuditLog({ actorType: actor.type, ...(actor.type === "ADMIN" ? { actorId: new mongoose.Types.ObjectId(actor.id) } : { actorReference: actor.reference }), action: "CREATOR_APPLICATION_APPROVED", entityType: "CREATOR_APPLICATION", entityId: application._id, before: { status: "submitted", creatorStatus: "pending" }, after: { status: application.status, creatorStatus: user.creatorStatus, creatorProfileId: String(creatorProfile._id) }, session });
      outcome.delivery = await notificationService.createWithOutcome({ recipientId: String(application.userId), category: "CREATOR_APPLICATION", type: "CREATOR_APPLICATION_UPDATE", title: "Creator Application Approved", body: "Your Creator Application has been approved. You can now access your Creator Dashboard.", navigationPath: "/dashboard/creator", metadata: { entityType: "CREATOR_APPLICATION", entityId: String(application._id) }, idempotencyKey: `creator-application:${application._id}:approved:${application.userId}`, session });
      outcome.creatorProfile = creatorProfile;
    });

    if (!outcome.creatorProfile) throw new AppError("Creator application approval did not complete", 500);
    const creatorProfile = outcome.creatorProfile;
    return { creatorProfile, delivery: outcome.delivery };
  } finally {
    await session.endSession();
  }
};

export const rejectCreatorApplicationDecision = async (input: CreatorRejectionInput) => {
  const actor = resolveDecisionActor(input);
  const session = await mongoose.startSession(); const outcome: { delivery: Awaited<ReturnType<typeof notificationService.createWithOutcome>> | null } = { delivery: null };
  try { let result: { applicationId: string } | null = null;
    await session.withTransaction(async () => {
      const application = await CreatorApplication.findById(input.applicationId).session(session);
      if (!application) throw new AppError("Application not found", 404);
      if (application.status !== "submitted") throw new AppError("Application not eligible for rejection", 400);
      if (typeof input.reason !== "string" || !input.reason.trim()) throw new AppError("Rejection reason is required", 400);
      if (actor.type === "SYSTEM") {
        const expected = input.expectedVerification;
        if (!expected || !Number.isInteger(expected.revision) || expected.revision < 1) throw new AppError("Creator verification authority is required for automated rejection", 409, "CREATOR_FACE_VERIFICATION_REQUIRED");
        const verification = await ProfileVerificationRequest.findOne({ _id: expected.requestId, targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, userId: application.userId, verificationRevision: expected.revision, profileSubmissionVersion: expected.revision, isActive: true, status: { $in: ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED"] } }).session(session);
        const snapshot = verification?.submittedMedia;
        if (!verification || application.verificationRevision !== expected.revision || !snapshot || !application.avatarUrl || !application.coverUrl
          || snapshot.avatar.sourceReference !== application.avatarUrl || snapshot.avatar.fingerprint !== fingerprintProfileMediaReference(application.avatarUrl)
          || snapshot.cover.sourceReference !== application.coverUrl || snapshot.cover.fingerprint !== fingerprintProfileMediaReference(application.coverUrl)
          || snapshot.profilePhotos.length !== (application.media ?? []).length || snapshot.profilePhotos.some((photo, index) => photo.profilePhotoIndex !== index || photo.sourceReference !== application.media?.[index] || photo.fingerprint !== fingerprintProfileMediaReference(application.media?.[index] ?? ""))) {
          throw new AppError("Creator verification submission is stale", 409, "CREATOR_FACE_VERIFICATION_REQUIRED");
        }
      }
      const user = await User.findById(application.userId).session(session); if (!user) throw new AppError("User not found", 404);
      application.status = "rejected"; application.rejectionReason = input.reason.trim();
      if (application.applicationJourney === "user_upgrade") {
        const verification = await ProfileVerificationRequest.findOne({ targetType: "CREATOR_APPLICATION", targetId: application._id, ownerUserId: application.userId, isActive: true }).session(session);
        if (verification) {
          const terminalVerification = await profileVerificationRequestRepository.transitionToTerminal({
            requestId: verification._id,
            decision: "REJECT",
            authority: actor.type === "SYSTEM" ? "AI" : "ADMIN",
            reason: application.rejectionReason,
            ...(actor.type === "ADMIN" ? { decidedBy: new mongoose.Types.ObjectId(actor.id) } : {}),
            decidedAt: new Date(),
            now: new Date(),
            session,
          });
          if (!terminalVerification) throw new AppError("Creator verification request is no longer eligible for rejection", 409);
          const deadline = new Date(verification.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
          await FaceVerificationSession.updateMany({ verificationRequestId: verification._id, isCurrent: true }, { $set: { isCurrent: false, status: "INVALIDATED", invalidatedAt: new Date(), invalidationCode: "CREATOR_APPLICATION_REJECTED", cleanupAfter: deadline } }, { session });
          await FaceVerificationEvidence.updateMany({ verificationRequestId: verification._id, status: { $in: ["UPLOADING", "STORED", "DELETE_PENDING"] } }, { $min: { cleanupAfter: deadline } }, { session });
          await ProfileVerificationJob.updateMany({ verificationRequestId: verification._id, status: { $in: ["PENDING", "RUNNING", "RETRY_WAIT"] } }, { $set: { status: "FAILED", failedAt: new Date(), lastErrorCode: "APPLICATION_REJECTED" }, $unset: { claimedAt: 1, leaseExpiresAt: 1, workerId: 1 } }, { session });
        }
      }
      await application.save({ session }); user.creatorStatus = "rejected"; await user.save({ session });
      await createAuditLog({ actorType: actor.type, ...(actor.type === "ADMIN" ? { actorId: new mongoose.Types.ObjectId(actor.id) } : { actorReference: actor.reference }), action: "CREATOR_APPLICATION_REJECTED", entityType: "CREATOR_APPLICATION", entityId: application._id, before: { status: "submitted", creatorStatus: "pending" }, after: { status: application.status, creatorStatus: user.creatorStatus, rejectionReason: application.rejectionReason }, session });
      outcome.delivery = await notificationService.createWithOutcome({ recipientId: String(application.userId), category: "CREATOR_APPLICATION", type: "CREATOR_APPLICATION_UPDATE", title: "Creator Application Needs Updates", body: "Your Creator Application was not approved. Review the feedback and resubmit when you are ready.", navigationPath: "/creator-application", metadata: { entityType: "CREATOR_APPLICATION", entityId: String(application._id) }, idempotencyKey: `creator-application:${application._id}:rejected:${application.userId}`, session }); result = { applicationId: String(application._id) };
    }); if (!result) throw new AppError("Creator application rejection did not complete", 500); if (outcome.delivery?.created) notificationDeliveryService.deliverPersisted(outcome.delivery.notification, { postCommit: true }); return result;
  } finally { await session.endSession(); }
};
