import { ClientSession, Types } from "mongoose";

import {
  ProfileVerificationDecision,
  ProfileVerificationDecisionAuthority,
  ProfileVerificationRequest,
  ProfileVerificationRequestDocument,
  ProfileVerificationRequestStatus,
} from "../models/profileVerificationRequest.model";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../services/profile/faceVerification.constants";

const activeStatuses: ProfileVerificationRequestStatus[] = ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED"];

export class ProfileVerificationRequestRepository {
  findActiveByProfileId(profileId: Types.ObjectId, session?: ClientSession) {
    return ProfileVerificationRequest.findOne({ profileId, isActive: true }).session(session ?? null).exec();
  }

  findLatestByProfileId(profileId: Types.ObjectId, session?: ClientSession) {
    return ProfileVerificationRequest.findOne({ profileId }).sort({ createdAt: -1, _id: -1 }).session(session ?? null).exec();
  }

  findById(requestId: Types.ObjectId) {
    return ProfileVerificationRequest.findById(requestId).exec();
  }

  findByVerificationReference(verificationReference: string) {
    return ProfileVerificationRequest.findOne({ verificationReference }).exec();
  }

  listActive() {
    return ProfileVerificationRequest.find({ isActive: true }).exec();
  }

  countByProfileId(profileId: Types.ObjectId, session?: ClientSession) {
    return ProfileVerificationRequest.countDocuments({ profileId }).session(session ?? null).exec();
  }

  listActiveByStatuses(statuses: ProfileVerificationRequestStatus[]) {
    return ProfileVerificationRequest.find({ isActive: true, status: { $in: statuses } })
      .sort({ submittedAt: -1, _id: -1 })
      .exec();
  }

  async create(input: Pick<ProfileVerificationRequestDocument, "verificationReference" | "profileId" | "userId" | "attemptNumber" | "profileSubmissionVersion" | "submittedAt">, session?: ClientSession) {
    const [request] = await ProfileVerificationRequest.create([{ ...input, status: "PENDING", isActive: true }], session ? { session } : undefined);
    return request;
  }

  transitionToTerminal(input: {
    requestId: Types.ObjectId;
    decision: ProfileVerificationDecision;
    authority: ProfileVerificationDecisionAuthority;
    reason?: string;
    decidedBy?: Types.ObjectId;
    decidedAt: Date;
    now: Date;
    session?: ClientSession;
  }) {
    const terminalStatus = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    return ProfileVerificationRequest.findOneAndUpdate(
      { _id: input.requestId, isActive: true, status: { $in: activeStatuses }, decision: { $exists: false }, submittedAt: { $gt: new Date(input.now.getTime() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) } },
      {
        $set: {
          status: terminalStatus,
          isActive: false,
          decision: input.decision,
          decisionAuthority: input.authority,
          ...(input.reason ? { decisionReason: input.reason } : {}),
          ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
          decidedAt: input.decidedAt,
        },
        ...(input.decision === "APPROVE" ? { $unset: { decisionReason: 1 } } : {}),
      },
      { new: true, runValidators: true, session: input.session },
    ).exec();
  }

  transitionToExpired(input: { requestId: Types.ObjectId; now: Date; retentionDeadline: Date; session?: ClientSession }) {
    return ProfileVerificationRequest.findOneAndUpdate(
      { _id: input.requestId, isActive: true, status: { $in: activeStatuses }, submittedAt: { $lte: input.retentionDeadline } },
      { $set: { status: "EXPIRED", isActive: false, expiredAt: input.now } },
      { new: true, runValidators: true, session: input.session },
    ).exec();
  }

  transitionToAdminReview(input: {
    requestId: Types.ObjectId;
    reasonCode: string;
    reason?: string;
    requiredAt: Date;
    now: Date;
    session?: ClientSession;
  }) {
    return ProfileVerificationRequest.findOneAndUpdate(
      { _id: input.requestId, isActive: true, status: { $in: ["PENDING", "PROCESSING"] }, decision: { $exists: false }, submittedAt: { $gt: new Date(input.now.getTime() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) } },
      {
        $set: {
          status: "ADMIN_REVIEW_REQUIRED",
          adminReviewRequiredAt: input.requiredAt,
          adminReviewReasonCode: input.reasonCode,
          ...(input.reason ? { adminReviewReason: input.reason } : {}),
        },
      },
      { new: true, runValidators: true, session: input.session },
    ).exec();
  }

  transitionPendingToProcessing(requestId: Types.ObjectId, processingStartedAt: Date) {
    return ProfileVerificationRequest.findOneAndUpdate(
      { _id: requestId, isActive: true, status: "PENDING", decision: { $exists: false }, submittedAt: { $gt: new Date(processingStartedAt.getTime() - FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS) } },
      { $set: { status: "PROCESSING", processingStartedAt } },
      { new: true, runValidators: true },
    ).exec();
  }
}

export const profileVerificationRequestRepository = new ProfileVerificationRequestRepository();
