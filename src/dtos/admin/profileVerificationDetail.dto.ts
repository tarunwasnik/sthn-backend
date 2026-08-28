import { FaceVerificationChallenge, FaceVerificationSessionDocument } from "../../models/faceVerificationSession.model";
import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";

export interface AdminProfileVerificationDetailDto {
  account: { userReference: string; email: string; status: string; role: string };
  profile: { profileReference: string; username: string; realName: string | null; dateOfBirth: Date; mobileCountryCode: string | null; mobileNumber: string | null; country: string | null; city: string | null; languages: string[]; bio: string; interests: string[]; profileStatus: string; verificationSubmissionVersion: number; verificationSubmittedAt: Date | null; rejectionReason: string | null; avatar: string; cover: string; profilePhotos: string[] };
  verificationRequest: { verificationReference: string; status: ProfileVerificationRequestDocument["status"]; attemptNumber: number; profileSubmissionVersion: number; submittedAt: Date; processingStartedAt: Date | null; adminReviewRequiredAt: Date | null; adminReviewReasonCode: string | null; adminReviewReason: string | null; decidedAt: Date | null; decision: string | null; decisionReason: string | null; expiredAt: Date | null };
  faceSession: { sessionReference: string; profileSubmissionVersion: number; status: FaceVerificationSessionDocument["status"]; isCurrent: boolean; requiredCaptureCount: number; acceptedCaptureCount: number; challenges: FaceVerificationChallenge[]; startedAt: Date; captureCompletedAt: Date | null; invalidatedAt: Date | null };
  captures: Array<{ challengeIndex: number; challengeType: FaceVerificationChallenge; viewPath: string }>;
  shadowIdentityAnalysis: { status: "NOT_CONFIGURED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; conclusion: "LIKELY_MATCH" | "LIKELY_MISMATCH" | "UNABLE_TO_DETERMINE" | null; similarity: number | null; threshold: number | null; model: { identifier: string; version: string } | null; processedAt: Date | null; reasonCode: string | null; reason: string | null };
}
