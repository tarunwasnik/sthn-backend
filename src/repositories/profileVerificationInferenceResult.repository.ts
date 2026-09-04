import { ProfileVerificationInferenceResult, ProfileVerificationInferenceResultDocument } from "../models/profileVerificationInferenceResult.model";

export type CreateProfileVerificationInferenceResultInput = Pick<
  ProfileVerificationInferenceResultDocument,
  | "inferenceReference"
  | "inferenceRunFingerprint"
  | "verificationRequestId"
  | "profileId"
  | "userId"
  | "profileSubmissionVersion"
  | "faceVerificationSessionId"
  | "evidenceSetFingerprint"
  | "pipelineManifestFingerprint"
  | "pipeline"
  | "findings"
  | "shadowIdentityAnalysis"
  | "profileMediaShadowAnalysis"
  | "gatedPolicyAnalysis"
  | "retentionDeadline"
>;

export class ProfileVerificationInferenceResultRepository {
  findByRunFingerprint(inferenceRunFingerprint: string) {
    return ProfileVerificationInferenceResult.findOne({ inferenceRunFingerprint }).exec();
  }
  findForAttempt(input: { requestId: import("mongoose").Types.ObjectId; profileSubmissionVersion: number; sessionId: import("mongoose").Types.ObjectId }) {
    return ProfileVerificationInferenceResult.findOne({ verificationRequestId: input.requestId, profileSubmissionVersion: input.profileSubmissionVersion, faceVerificationSessionId: input.sessionId }).sort({ createdAt: -1, _id: -1 }).exec();
  }
  findAnyByRequestId(requestId: import("mongoose").Types.ObjectId) {
    return ProfileVerificationInferenceResult.findOne({ verificationRequestId: requestId }).sort({ createdAt: -1, _id: -1 }).exec();
  }
  findByRequestIds(requestIds: import("mongoose").Types.ObjectId[]) {
    return ProfileVerificationInferenceResult.find({ verificationRequestId: { $in: requestIds } }).sort({ createdAt: -1, _id: -1 }).exec();
  }

  create(input: CreateProfileVerificationInferenceResultInput) {
    return ProfileVerificationInferenceResult.create(input);
  }

  shortenRetentionDeadline(id: import("mongoose").Types.ObjectId, existingDeadline: Date, proposedDeadline: Date) {
    const deadline = new Date(Math.min(existingDeadline.getTime(), proposedDeadline.getTime()));
    return ProfileVerificationInferenceResult.findOneAndUpdate(
      { _id: id, retentionDeadline: { $gt: deadline } },
      { $set: { retentionDeadline: deadline } },
      { new: true, runValidators: true, overwriteImmutable: true },
    ).exec();
  }

  async shortenRetentionForRequest(requestId: import("mongoose").Types.ObjectId, proposedDeadline: Date) {
    const results = await ProfileVerificationInferenceResult.find({ verificationRequestId: requestId, retentionDeadline: { $gt: proposedDeadline } }).select("_id retentionDeadline").exec();
    return Promise.all(results.map((result) => this.shortenRetentionDeadline(result._id, result.retentionDeadline, proposedDeadline)));
  }

  listDueForDeletion(now: Date, limit = 50) {
    return ProfileVerificationInferenceResult.find({ retentionDeadline: { $lte: now } }).sort({ retentionDeadline: 1, _id: 1 }).limit(limit).exec();
  }

  deleteById(id: import("mongoose").Types.ObjectId) { return ProfileVerificationInferenceResult.deleteOne({ _id: id }).exec(); }
}

export const profileVerificationInferenceResultRepository = new ProfileVerificationInferenceResultRepository();
