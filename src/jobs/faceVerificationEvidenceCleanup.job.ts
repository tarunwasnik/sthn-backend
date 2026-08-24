import { reconcileFaceVerificationEvidenceRetention } from "../services/profile/faceVerificationEvidenceCleanup.service";
export const faceVerificationEvidenceCleanupJob = async () => reconcileFaceVerificationEvidenceRetention();
