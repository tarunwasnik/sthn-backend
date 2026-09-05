import { ProfileVerificationRequestDocument, ProfileVerificationPolicy } from "../../models/profileVerificationRequest.model";

export const LEGACY_PROFILE_VERIFICATION_POLICY: ProfileVerificationPolicy = {
  key: "LEGACY_AVATAR_ONLY",
  version: "V1",
};

export const GATED_PROFILE_VERIFICATION_POLICY_V1: ProfileVerificationPolicy = {
  key: "GATED_MULTI_MEDIA",
  version: "V1",
};

export const GATED_PROFILE_VERIFICATION_POLICY_V2: ProfileVerificationPolicy = {
  key: "GATED_MULTI_MEDIA",
  version: "V2",
};

/** Historical alias retained for callers and fixtures that mean shadow-only V1. */
export const GATED_PROFILE_VERIFICATION_POLICY = GATED_PROFILE_VERIFICATION_POLICY_V1;

export const parseNewProfileVerificationPolicy = (value: unknown): ProfileVerificationPolicy => {
  if (value === undefined || value === null || value === "") return LEGACY_PROFILE_VERIFICATION_POLICY;
  if (typeof value !== "string") throw new Error("STHN_PROFILE_VERIFICATION_POLICY must select a supported verification policy");
  const normalized = value.trim();
  if (normalized === "LEGACY_AVATAR_ONLY" || normalized === "LEGACY_AVATAR_ONLY_V1") return LEGACY_PROFILE_VERIFICATION_POLICY;
  if (normalized === "GATED_MULTI_MEDIA" || normalized === "GATED_MULTI_MEDIA_V1") return GATED_PROFILE_VERIFICATION_POLICY_V1;
  if (normalized === "GATED_MULTI_MEDIA_V2") return GATED_PROFILE_VERIFICATION_POLICY_V2;
  throw new Error("STHN_PROFILE_VERIFICATION_POLICY must be LEGACY_AVATAR_ONLY_V1, GATED_MULTI_MEDIA_V1, or GATED_MULTI_MEDIA_V2");
};

/**
 * New requests capture this value permanently. Existing requests are never
 * reinterpreted from current configuration.
 */
export const selectNewProfileVerificationPolicy = (): ProfileVerificationPolicy => parseNewProfileVerificationPolicy(process.env.STHN_PROFILE_VERIFICATION_POLICY);

export const resolveProfileVerificationPolicy = (
  request: Pick<ProfileVerificationRequestDocument, "verificationPolicy">,
): ProfileVerificationPolicy => request.verificationPolicy ?? LEGACY_PROFILE_VERIFICATION_POLICY;

export const isGatedProfileVerificationPolicy = (
  policy: ProfileVerificationPolicy,
) => policy.key === "GATED_MULTI_MEDIA" && (policy.version === "V1" || policy.version === "V2");

export const hasGatedAutomatedDecisionAuthority = (
  policy: ProfileVerificationPolicy,
) => policy.key === "GATED_MULTI_MEDIA" && policy.version === "V2";
