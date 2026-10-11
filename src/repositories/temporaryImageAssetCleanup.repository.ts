import { ClientSession, Types } from "mongoose";
import { ImageAdmission } from "../models/imageAdmission.model";
import { ImageModerationAsset, ImageModerationAssetDocument } from "../models/imageModerationAsset.model";
import { ImageModerationAttempt } from "../models/imageModerationAttempt.model";
import { FaceVerificationSession } from "../models/faceVerificationSession.model";
import { ProviderAssetReference } from "../models/providerAssetReference.model";
import { UserProfile } from "../models/userProfile.model";
import { CreatorApplication } from "../models/creatorApplication.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CreatorService } from "../models/creatorService.model";

const dueStatuses = ["PENDING", "RETRY_WAIT"] as const;

export class TemporaryImageAssetCleanupRepository {
  listDue(now: Date, limit: number) {
    return ImageModerationAsset.find({
      status: { $in: ["TEMPORARY", "RESERVED", "EXPIRED"] },
      cleanupStatus: { $in: dueStatuses },
      $and: [
        { $or: [{ expiresAt: { $lte: now } }, { releaseRequestedAt: { $lte: now } }] },
        { $or: [{ cleanupNextAttemptAt: { $exists: false } }, { cleanupNextAttemptAt: { $lte: now } }] },
      ],
    }).sort({ expiresAt: 1, _id: 1 }).limit(limit).exec();
  }

  listExpiredReservations(now: Date, limit: number) {
    return ImageModerationAsset.find({ status: "RESERVED", cleanupStatus: "DELETE_RESERVED", cleanupLeaseExpiresAt: { $lte: now } }).sort({ cleanupLeaseExpiresAt: 1, _id: 1 }).limit(limit).exec();
  }

  listExpiredDeletes(now: Date, limit: number) {
    return ImageModerationAsset.find({ status: "RESERVED", cleanupStatus: "DELETE_IN_PROGRESS", cleanupLeaseExpiresAt: { $lte: now } }).sort({ cleanupLeaseExpiresAt: 1, _id: 1 }).limit(limit).exec();
  }

  reserve(input: { assetId: Types.ObjectId; token: string; leaseExpiresAt: Date; now: Date; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({
      _id: input.assetId,
      status: { $in: ["TEMPORARY", "RESERVED", "EXPIRED"] },
      cleanupStatus: { $in: dueStatuses },
      $and: [
        { $or: [{ expiresAt: { $lte: input.now } }, { releaseRequestedAt: { $lte: input.now } }] },
        { $or: [{ cleanupNextAttemptAt: { $exists: false } }, { cleanupNextAttemptAt: { $lte: input.now } }] },
      ],
    }, {
      $set: { status: "RESERVED", cleanupStatus: "DELETE_RESERVED", cleanupLeaseToken: input.token, cleanupLeaseExpiresAt: input.leaseExpiresAt },
      $unset: { cleanupNextAttemptAt: 1 },
      $inc: { cleanupAttemptCount: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  markAdmissionsExpired(assetId: Types.ObjectId, now: Date, session: ClientSession) {
    return ImageAdmission.updateMany({ assetId, status: "ACTIVE" }, { $set: { status: "EXPIRED", invalidatedAt: now } }, { session }).exec();
  }

  invalidateActiveAdmissions(assetId: Types.ObjectId, now: Date, session: ClientSession) {
    return ImageAdmission.updateMany({ assetId, status: "ACTIVE" }, { $set: { status: "INVALIDATED", invalidatedAt: now } }, { session }).exec();
  }

  findOwnedByReference(input: { assetReference: string; actorId: Types.ObjectId; session: ClientSession }) {
    return ImageModerationAsset.findOne({ assetReference: input.assetReference, actorId: input.actorId }).session(input.session).exec();
  }

  findAttemptForRelease(input: { assetId: Types.ObjectId; actorId: Types.ObjectId; surface: string; session: ClientSession }) {
    return ImageModerationAttempt.findOne({ assetId: input.assetId, actorId: input.actorId, surface: input.surface }).session(input.session).exec();
  }

  requestRelease(input: { assetId: Types.ObjectId; now: Date; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: { $in: ["TEMPORARY", "EXPIRED"] }, cleanupStatus: { $in: dueStatuses } }, {
      $set: { releaseRequestedAt: input.now },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  markAttemptExpired(assetId: Types.ObjectId, now: Date, session: ClientSession) {
    return ImageModerationAttempt.updateMany({ assetId, status: { $in: ["CREATED", "PROCESSING"] } }, { $set: { status: "EXPIRED", invalidatedAt: now } }, { session }).exec();
  }

  markProtected(input: { assetId: Types.ObjectId; now: Date; nextAttemptAt: Date; code: string; message: string; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: { $ne: "COMMITTED" }, cleanupStatus: { $in: dueStatuses } }, {
      $set: { status: "EXPIRED", cleanupStatus: "RETRY_WAIT", cleanupNextAttemptAt: input.nextAttemptAt, cleanupLastErrorCode: input.code, cleanupLastErrorMessage: input.message },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  releaseReservedAsProtected(input: { assetId: Types.ObjectId; token: string; nextAttemptAt: Date; code: string; message: string; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_RESERVED", cleanupLeaseToken: input.token }, {
      $set: { status: "EXPIRED", cleanupStatus: "RETRY_WAIT", cleanupNextAttemptAt: input.nextAttemptAt, cleanupLastErrorCode: input.code, cleanupLastErrorMessage: input.message },
      $unset: { cleanupLeaseToken: 1, cleanupLeaseExpiresAt: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  recoverReserved(input: { assetId: Types.ObjectId; token: string; nextAttemptAt: Date; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_RESERVED", cleanupLeaseToken: input.token }, {
      $set: { status: "EXPIRED", cleanupStatus: "RETRY_WAIT", cleanupNextAttemptAt: input.nextAttemptAt, cleanupLastErrorCode: "LEASE_EXPIRED", cleanupLastErrorMessage: "Provider deletion did not start before its reservation lease expired." },
      $unset: { cleanupLeaseToken: 1, cleanupLeaseExpiresAt: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  startDeletion(input: { assetId: Types.ObjectId; token: string; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_RESERVED", cleanupLeaseToken: input.token }, {
      $set: { cleanupStatus: "DELETE_IN_PROGRESS" },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  complete(input: { assetId: Types.ObjectId; token: string; now: Date; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_IN_PROGRESS", cleanupLeaseToken: input.token }, {
      $set: { status: "EXPIRED", cleanupStatus: "DELETED", cleanupDeletedAt: input.now },
      $unset: { cleanupLeaseToken: 1, cleanupLeaseExpiresAt: 1, cleanupNextAttemptAt: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  retry(input: { assetId: Types.ObjectId; token: string; nextAttemptAt: Date; code: string; message: string; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_IN_PROGRESS", cleanupLeaseToken: input.token }, {
      $set: { cleanupStatus: "RETRY_WAIT", cleanupNextAttemptAt: input.nextAttemptAt, cleanupLastErrorCode: input.code, cleanupLastErrorMessage: input.message },
      $unset: { cleanupLeaseToken: 1, cleanupLeaseExpiresAt: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  markUnknown(input: { assetId: Types.ObjectId; token: string; code: string; message: string; session: ClientSession }) {
    return ImageModerationAsset.findOneAndUpdate({ _id: input.assetId, status: "RESERVED", cleanupStatus: "DELETE_IN_PROGRESS", cleanupLeaseToken: input.token }, {
      $set: { cleanupStatus: "DELETE_UNKNOWN", cleanupLastErrorCode: input.code, cleanupLastErrorMessage: input.message },
      $unset: { cleanupLeaseExpiresAt: 1 },
    }, { new: true, session: input.session, runValidators: true }).exec();
  }

  async hasProtectedReference(input: { asset: ImageModerationAssetDocument; session: ClientSession }) {
    const reference = input.asset.trustedMediaReference;
    const [providerReference, activeCandidate, profileReference, creatorApplicationReference, creatorProfileReference, creatorServiceReference] = await Promise.all([
      ProviderAssetReference.exists({ imageModerationAssetId: input.asset._id, state: "CURRENT" }).session(input.session),
      FaceVerificationSession.exists({
        isCurrent: true,
        status: { $in: ["CREATED", "CAPTURING", "CAPTURE_COMPLETE"] },
        "avatarCandidate.kind": "ADMISSION",
        "avatarCandidate.assetId": input.asset._id,
      }).session(input.session),
      UserProfile.exists({ $or: [{ avatar: reference }, { cover: reference }, { profilePhotos: reference }] }).session(input.session),
      CreatorApplication.exists({ $or: [{ avatarUrl: reference }, { coverUrl: reference }, { media: reference }] }).session(input.session),
      CreatorProfile.exists({ $or: [{ avatarUrl: reference }, { coverUrl: reference }, { media: reference }] }).session(input.session),
      CreatorService.exists({ media: reference }).session(input.session),
    ]);
    return Boolean(providerReference || activeCandidate || profileReference || creatorApplicationReference || creatorProfileReference || creatorServiceReference);
  }

  findById(assetId: Types.ObjectId, session?: ClientSession) { return ImageModerationAsset.findById(assetId).session(session ?? null).exec(); }
  isCommitted(asset: ImageModerationAssetDocument) { return asset.status === "COMMITTED"; }
}

export const temporaryImageAssetCleanupRepository = new TemporaryImageAssetCleanupRepository();
