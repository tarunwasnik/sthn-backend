/** Explicit operator authority wins; only an explicit development environment defaults to one local worker. */
export const parseProfileVerificationWorkerEnabled = (value: string | undefined, nodeEnvironment = process.env.NODE_ENV): boolean => {
  if (value === undefined) return nodeEnvironment === "development";
  const normalized = value.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("STHN_PROFILE_VERIFICATION_WORKER_ENABLED must be exactly true or false");
};

/** Startup diagnostics are opt-in because they intentionally initialize the YuNet runtime. */
export const parseProfileVerificationStartupDiagnosticEnabled = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const normalized = value.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("STHN_PROFILE_VERIFICATION_STARTUP_DIAGNOSTIC_ENABLED must be exactly true or false");
};

/** Immutable process-lifetime authority for participation in the verification-worker pool. */
export const PROFILE_VERIFICATION_WORKER_ENABLED = parseProfileVerificationWorkerEnabled(
  process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED,
);

export const PROFILE_VERIFICATION_STARTUP_DIAGNOSTIC_ENABLED = parseProfileVerificationStartupDiagnosticEnabled(
  process.env.STHN_PROFILE_VERIFICATION_STARTUP_DIAGNOSTIC_ENABLED,
);
