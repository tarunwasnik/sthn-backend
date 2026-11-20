import { CreatorApplication } from "../../models/creatorApplication.model";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationInferenceResultDocument } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationRequestDocument } from "../../models/profileVerificationRequest.model";
import { AppError } from "../../utils/AppError";
import { isCreatorApplicationAutomaticVerificationEnabled } from "../../config/profileVerificationAutomaticDecision";
import { SFACE_ARTIFACT } from "../profile/profileVerificationFaceEmbeddingAdapter";
import { YUNET_ARTIFACT } from "../profile/profileVerificationYuNet.constants";
import { fingerprintProfileMediaReference } from "../profile/profileVerificationSubmittedMedia.service";
import { approveCreatorApplicationDecision, rejectCreatorApplicationDecision } from "./creatorApplicationDecision.service";

export const CREATOR_V3_AUTOMATED_ACTOR = { type: "SYSTEM", reference: "CREATOR_V3_AUTOMATED_VERIFICATION" } as const;
export const CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD = 0.36;
export const CREATOR_V3_CROSS_CAPTURE_THRESHOLD = 0.28;
export const CREATOR_V3_MULTI_FACE_MARGIN = 0.04;

export type CreatorV3BiometricIdentityResult = "MATCH" | "MISMATCH" | "ADMIN_REVIEW";
export type CreatorV3ApplicationEligibilityResult = "ELIGIBLE" | "INELIGIBLE" | "ADMIN_REVIEW";
export type CreatorV3FinalAction = "APPROVE" | "REJECT" | "ADMIN_REVIEW" | "DISABLED" | "CONCURRENT_TERMINAL";
export type CreatorV3Evaluation = Readonly<{ biometricIdentity: CreatorV3BiometricIdentityResult; applicationEligibility: CreatorV3ApplicationEligibilityResult; finalAction: CreatorV3FinalAction; reason: string }>;

const review = (reason: string, applicationEligibility: CreatorV3ApplicationEligibilityResult = "ADMIN_REVIEW"): CreatorV3Evaluation => ({ biometricIdentity: "ADMIN_REVIEW", applicationEligibility, finalAction: "ADMIN_REVIEW", reason });
const reject = (reason: string): CreatorV3Evaluation => ({ biometricIdentity: "MISMATCH", applicationEligibility: "ADMIN_REVIEW", finalAction: "REJECT", reason });

/** Pure evidence policy. Scores are thresholded similarity measures, never identity probabilities. */
export const evaluateCreatorV3Evidence = (request: ProfileVerificationRequestDocument, result: ProfileVerificationInferenceResultDocument | null): CreatorV3Evaluation => {
  if (!result || request.targetType !== "CREATOR_APPLICATION" || !request.targetId || !request.ownerUserId || !request.verificationRevision
    || request.verificationPolicy?.key !== "GATED_MULTI_MEDIA" || request.verificationPolicy.version !== "V3" || !request.submittedMedia) return review("Creator V3 request authority is incomplete.");
  if (result.targetType !== "CREATOR_APPLICATION" || String(result.verificationRequestId) !== String(request._id)
    || String(result.targetId) !== String(request.targetId) || String(result.ownerUserId) !== String(request.ownerUserId)
    || String(result.userId) !== String(request.ownerUserId) || result.verificationRevision !== request.verificationRevision
    || result.profileSubmissionVersion !== request.verificationRevision) return review("Inference authority does not match the current Creator submission.");
  if (result.pipeline.kind !== "MODEL_RUNTIME" || result.pipeline.detector?.identifier !== YUNET_ARTIFACT.identifier
    || result.pipeline.detector.version !== YUNET_ARTIFACT.version || result.pipeline.embedding?.identifier !== SFACE_ARTIFACT.identifier
    || result.pipeline.embedding.version !== SFACE_ARTIFACT.version) return review("Required YuNet/SFace inference provenance is unavailable.");
  const captures = result.findings.captures;
  if (captures.length !== 5 || new Set(captures.map((capture) => capture.challengeIndex)).size !== 5
    || captures.some((capture) => capture.challengeIndex < 0 || capture.challengeIndex > 4)) return review("Capture evidence is incomplete and requires review.");
  if (captures.some((capture) => capture.faceCount !== "ONE" || capture.usability !== "USABLE")) return reject("Complete a new five-capture session with one clear face in each capture.");
  const analysis = result.gatedPolicyAnalysis;
  if (!analysis || analysis.policy.key !== "GATED_MULTI_MEDIA" || analysis.policy.version !== "V3"
    || analysis.gate1.usableCaptureCount !== 5
    || analysis.gate1.threshold !== CREATOR_V3_CROSS_CAPTURE_THRESHOLD || analysis.gate1.policyVersion !== "V1") return review("Cross-capture evidence is incomplete or technically unavailable.");
  if (analysis.gate1.outcome === "LIVE_ANCHOR_INCOHERENT" && analysis.gate1.usableCaptureCount === 5 && Number.isFinite(analysis.gate1.weakestPeerMedian) && analysis.gate1.weakestPeerMedian! < CREATOR_V3_CROSS_CAPTURE_THRESHOLD) return reject("Complete a new five-capture session with consistent captures of the same person.");
  if (analysis.gate1.outcome !== "PASS" || !Number.isFinite(analysis.gate1.weakestPeerMedian) || analysis.gate1.weakestPeerMedian! < CREATOR_V3_CROSS_CAPTURE_THRESHOLD) return review("Cross-capture evidence is incomplete or technically unavailable.");
  if (analysis.gate2?.outcome === "AVATAR_INVALID" && ["AVATAR_INVALID_NO_FACE", "AVATAR_INVALID_FACE_UNUSABLE", "AVATAR_INVALID_MULTIPLE_FACES"].includes(analysis.gate2.avatarAdmission ?? "")) return reject("Replace your avatar with a clear image containing one face.");
  if (!analysis.gate2 || analysis.gate2.outcome !== "READY_FOR_GATE3" || analysis.gate2.avatarAdmission !== "VALID_SINGLE_FACE") return review("Creator avatar evidence requires Admin review.");
  const media = result.profileMediaShadowAnalysis;
  if (!media || media.status !== "COMPLETED" || media.live.usableCaptureCount !== 5 || media.summary.multiFaceMediaCount < 0
    || media.media.some((item) => item.candidateCount > 1 && (!Number.isFinite(item.bestVsSecondMargin) || item.bestVsSecondMargin! < CREATOR_V3_MULTI_FACE_MARGIN))) return review("Creator media evidence is incomplete or multi-face ambiguous.");
  const gate3 = analysis.gate3;
  if (!gate3 || gate3.membershipThreshold !== CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD || gate3.multiFaceMinMargin !== CREATOR_V3_MULTI_FACE_MARGIN
    || !Number.isFinite(gate3.avatarMedianSimilarity)) return review("Avatar comparison evidence is unavailable.");
  if (gate3.conclusion === "LIKELY_MATCH" && gate3.avatarMembership === "PERSON_A_SUPPORTED" && gate3.avatarMedianSimilarity! >= CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD) {
    return { biometricIdentity: "MATCH", applicationEligibility: "ADMIN_REVIEW", finalAction: "ADMIN_REVIEW", reason: "Biometric identity match is established; marketplace eligibility must be checked separately." };
  }
  if (gate3.conclusion === "LIKELY_MISMATCH" && gate3.avatarMembership === "PERSON_A_NOT_ESTABLISHED" && gate3.avatarMedianSimilarity! < CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD && gate3.optionalPersonASupportCount === 0 && gate3.optionalAmbiguousMediaCount === 0 && gate3.optionalTechnicalFailureCount === 0) {
    return { biometricIdentity: "MISMATCH", applicationEligibility: "ADMIN_REVIEW", finalAction: "REJECT", reason: "Completed Creator V3 biometric evidence established an avatar mismatch." };
  }
  return review("Creator V3 biometric evidence is uncertain or contradictory.");
};

const currentApplicationEligible = async (request: ProfileVerificationRequestDocument) => {
  if (!request.targetId || !request.ownerUserId || !request.verificationRevision || !request.submittedMedia) return false;
  const [application, profile] = await Promise.all([
    CreatorApplication.findOne({ _id: request.targetId, userId: request.ownerUserId, applicationJourney: "user_upgrade", verificationRevision: request.verificationRevision, status: "submitted" }).lean(),
    UserProfile.exists({ userId: request.ownerUserId, profileStatus: "verified" }),
  ]);
  if (!application || !profile || !application.avatarUrl || !application.coverUrl) return false;
  const snapshot = request.submittedMedia;
  const media = application.media ?? [];
  return snapshot.avatar.sourceReference === application.avatarUrl && snapshot.avatar.fingerprint === fingerprintProfileMediaReference(application.avatarUrl)
    && snapshot.cover.sourceReference === application.coverUrl && snapshot.cover.fingerprint === fingerprintProfileMediaReference(application.coverUrl)
    && snapshot.profilePhotos.length === media.length && snapshot.profilePhotos.every((photo, index) => photo.profilePhotoIndex === index && photo.sourceReference === media[index] && photo.fingerprint === fingerprintProfileMediaReference(media[index]));
};

/** Re-reads application authority immediately before the shared decision transaction. */
export const applyCreatorV3AutomaticDecision = async (input: { request: ProfileVerificationRequestDocument; result: ProfileVerificationInferenceResultDocument | null; enabled?: boolean }) => {
  const evaluated = evaluateCreatorV3Evidence(input.request, input.result);
  if (!(input.enabled ?? isCreatorApplicationAutomaticVerificationEnabled())) return { evaluation: { ...evaluated, finalAction: "DISABLED" as const }, approval: null, rejection: null };
  if (evaluated.finalAction === "REJECT") {
    if (!(await currentApplicationEligible(input.request))) return { evaluation: review("Creator application authority changed before automatic decision."), approval: null, rejection: null };
    try {
      const rejection = await rejectCreatorApplicationDecision({ applicationId: String(input.request.targetId), actor: CREATOR_V3_AUTOMATED_ACTOR, expectedVerification: { requestId: String(input.request._id), revision: input.request.verificationRevision! }, reason: evaluated.reason });
      return { evaluation: evaluated, approval: null, rejection };
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 400) return { evaluation: { ...evaluated, finalAction: "CONCURRENT_TERMINAL" as const, reason: "A concurrent Admin or lifecycle action finalized the application." }, approval: null, rejection: null };
      throw error;
    }
  }
  if (evaluated.biometricIdentity !== "MATCH") return { evaluation: evaluated, approval: null, rejection: null };
  if (!(await currentApplicationEligible(input.request))) return { evaluation: { ...evaluated, applicationEligibility: "INELIGIBLE" as const, finalAction: "ADMIN_REVIEW" as const, reason: "Biometric identity matched, but the current Creator application is not deterministically eligible." }, approval: null, rejection: null };
  try {
    const approval = await approveCreatorApplicationDecision({
      applicationId: String(input.request.targetId),
      actor: CREATOR_V3_AUTOMATED_ACTOR,
      aiDecisionSnapshot: {
        model: input.result!.profileMediaShadowAnalysis!.model,
        similarity: input.result!.gatedPolicyAnalysis!.gate3!.avatarMedianSimilarity!,
        threshold: input.result!.gatedPolicyAnalysis!.gate3!.membershipThreshold,
      },
    });
    return { evaluation: { ...evaluated, applicationEligibility: "ELIGIBLE" as const, finalAction: "APPROVE" as const }, approval, rejection: null };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 400) return { evaluation: { ...evaluated, finalAction: "CONCURRENT_TERMINAL" as const, reason: "A concurrent Admin or lifecycle action finalized the application." }, approval: null, rejection: null };
    throw error;
  }
};
