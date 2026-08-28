import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { deleteFaceVerificationEvidence } from "./faceVerificationEvidenceStorage.service";
import { expireFaceVerificationSessions } from "./faceVerificationSession.service";
import { FACE_VERIFICATION_APPROVED_RETENTION_MS, FACE_VERIFICATION_REJECTED_RETENTION_MS } from "./faceVerification.constants";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "./faceVerification.constants";
import { profileVerificationRequestRepository } from "../../repositories/profileVerificationRequest.repository";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { expireProfileVerificationRequests } from "./profileVerificationRequest.service";

export const scheduleFaceEvidenceRetentionForDecision = async (requestId: import("mongoose").Types.ObjectId, decision: "APPROVE" | "REJECT", decidedAt: Date) => {
  const duration = decision === "APPROVE" ? FACE_VERIFICATION_APPROVED_RETENTION_MS : FACE_VERIFICATION_REJECTED_RETENTION_MS;
  const request = await profileVerificationRequestRepository.findById(requestId);
  if (!request) return null;
  const maximum = new Date(request.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS);
  const deadline = new Date(Math.min(maximum.getTime(), decidedAt.getTime() + duration));
  await profileVerificationInferenceResultRepository.shortenRetentionForRequest(requestId, deadline);
  return faceVerificationEvidenceRepository.setRetentionForRequest(requestId, deadline);
};

export const reconcileFaceVerificationEvidenceRetention = async (now = new Date()) => {
  await expireProfileVerificationRequests(now);
  await expireFaceVerificationSessions(now);
  const results = await profileVerificationInferenceResultRepository.listDueForDeletion(now);
  for (const result of results) await profileVerificationInferenceResultRepository.deleteById(result._id);
  const due = await faceVerificationEvidenceRepository.listDueForCleanup(now);
  let deleted = 0;
  for (const evidence of due) {
    const claimed = await faceVerificationEvidenceRepository.claimDueForDeletion(evidence._id, now);
    if (!claimed) continue;
    const outcome = await deleteFaceVerificationEvidence(claimed.cloudinaryPublicId);
    if (outcome === "DELETED" || outcome === "ALREADY_MISSING") {
      if (await faceVerificationEvidenceRepository.markDeleted(claimed._id, now, claimed.deletionClaimToken!)) deleted += 1;
    } else await faceVerificationEvidenceRepository.releaseDeletionClaim(claimed._id, claimed.deletionClaimToken!);
  }
  return { scanned: due.length, deleted, resultsDeleted: results.length };
};
