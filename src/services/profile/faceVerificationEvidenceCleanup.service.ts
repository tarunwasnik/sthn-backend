import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { deleteFaceVerificationEvidence } from "./faceVerificationEvidenceStorage.service";
import { expireFaceVerificationSessions } from "./faceVerificationSession.service";
import { FACE_VERIFICATION_APPROVED_RETENTION_MS, FACE_VERIFICATION_REJECTED_RETENTION_MS } from "./faceVerification.constants";

export const scheduleFaceEvidenceRetentionForDecision = async (requestId: import("mongoose").Types.ObjectId, decision: "APPROVE" | "REJECT", decidedAt: Date) => {
  const duration = decision === "APPROVE" ? FACE_VERIFICATION_APPROVED_RETENTION_MS : FACE_VERIFICATION_REJECTED_RETENTION_MS;
  return faceVerificationEvidenceRepository.setRetentionForRequest(requestId, new Date(decidedAt.getTime() + duration));
};

export const reconcileFaceVerificationEvidenceRetention = async (now = new Date()) => {
  await expireFaceVerificationSessions(now);
  const due = await faceVerificationEvidenceRepository.listDueForCleanup(now);
  for (const evidence of due) {
    await deleteFaceVerificationEvidence(evidence.cloudinaryPublicId);
    await faceVerificationEvidenceRepository.markDeleted(evidence._id, now);
  }
  return { scanned: due.length, deleted: due.length };
};
