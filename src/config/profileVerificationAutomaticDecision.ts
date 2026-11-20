/**
 * V3 automation is the normal workflow for new eligible submissions. An
 * explicit `false` is the independent emergency Admin-only control; malformed
 * values fail closed. Historical V1/V2 request snapshots never gain V3
 * authority from this configuration.
 */
const enabled = (value: string | undefined) => value === undefined || value.trim() === "true";

export const USER_PROFILE_AUTOMATIC_VERIFICATION_ENABLED = enabled(
  process.env.STHN_USER_PROFILE_AUTOMATIC_VERIFICATION_ENABLED,
);

/** Resolve at decision time; absent or malformed configuration stays disabled. */
export const isUserProfileAutomaticVerificationEnabled = () => enabled(
  process.env.STHN_USER_PROFILE_AUTOMATIC_VERIFICATION_ENABLED,
);

export const CREATOR_APPLICATION_AUTOMATIC_VERIFICATION_ENABLED = enabled(
  process.env.STHN_CREATOR_APPLICATION_AUTOMATIC_VERIFICATION_ENABLED,
);

/** Resolve at decision time so a disabled process can never retain a stale opt-in. */
export const isCreatorApplicationAutomaticVerificationEnabled = () => enabled(
  process.env.STHN_CREATOR_APPLICATION_AUTOMATIC_VERIFICATION_ENABLED,
);
