import { ProfileStatus } from "../../models/userProfile.model";
import { ProfileVerificationRequestStatus } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJobStatus } from "../../models/profileVerificationJob.model";

export type ProfileVerificationLifecycleStage =
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "PROCESSING"
  | "AI_COMPLETED_AWAITING_ADMIN"
  | "MANUAL_REVIEW"
  | "REJECTED"
  | "VERIFIED";

/** Safe, product-facing lifecycle derived from existing immutable authorities. */
export const deriveProfileVerificationLifecycleStage = (input: {
  profileStatus: ProfileStatus;
  requestStatus?: ProfileVerificationRequestStatus;
  jobStatus?: ProfileVerificationJobStatus;
  hasCompletedInference?: boolean;
}): ProfileVerificationLifecycleStage => {
  if (input.profileStatus === "incomplete") return "NOT_SUBMITTED";
  if (input.profileStatus === "rejected") return "REJECTED";
  if (input.profileStatus === "verified") return "VERIFIED";
  if (input.requestStatus === "ADMIN_REVIEW_REQUIRED") return "MANUAL_REVIEW";
  if (input.jobStatus === "COMPLETED" && input.hasCompletedInference) return "AI_COMPLETED_AWAITING_ADMIN";
  if (input.requestStatus === "PROCESSING" || input.jobStatus === "RUNNING" || input.jobStatus === "RETRY_WAIT") return "PROCESSING";
  return "SUBMITTED";
};
