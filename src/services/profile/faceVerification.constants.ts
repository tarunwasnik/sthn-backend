/** V1 technical lifecycle defaults; privacy policy may refine them later. */
export const FACE_VERIFICATION_SESSION_TTL_MS = 15 * 60 * 1000;
export const FACE_VERIFICATION_SHORT_CLEANUP_MS = 24 * 60 * 60 * 1000;
export const FACE_VERIFICATION_REJECTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const FACE_VERIFICATION_APPROVED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Maximum retention for biometric material belonging to one submitted request. */
export const FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS = FACE_VERIFICATION_APPROVED_RETENTION_MS;
export const FACE_VERIFICATION_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const FACE_VERIFICATION_EVIDENCE_MAX_AGGREGATE_BYTES = 25 * 1024 * 1024;
export const FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS = 15 * 1000;
/** Stale deletion claims may be recovered after a worker crash. */
export const FACE_VERIFICATION_EVIDENCE_DELETION_CLAIM_TTL_MS = 5 * 60 * 1000;
