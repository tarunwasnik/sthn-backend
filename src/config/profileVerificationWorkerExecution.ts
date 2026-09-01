/** Parses the explicit execution capability; absence is deliberately fail-closed. */
export const parseProfileVerificationWorkerEnabled = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const normalized = value.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("STHN_PROFILE_VERIFICATION_WORKER_ENABLED must be exactly true or false");
};

/** Immutable process-lifetime authority for participation in the verification-worker pool. */
export const PROFILE_VERIFICATION_WORKER_ENABLED = parseProfileVerificationWorkerEnabled(
  process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED,
);
