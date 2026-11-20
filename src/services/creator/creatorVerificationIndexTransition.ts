export type MongoIndexDescription = Readonly<{
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}>;

export const LEGACY_ACTIVE_PROFILE_SESSION_INDEX = "one_current_face_verification_session";
export const LEGACY_ACTIVE_PROFILE_REQUEST_INDEX = "one_active_profile_verification_request";
export const TYPED_ACTIVE_TARGET_SESSION_INDEX = "one_current_face_verification_target_session";
export const TYPED_ACTIVE_TARGET_REQUEST_INDEX = "one_active_target_verification_request";

export const typedActiveTargetSessionIndex = Object.freeze({
  name: TYPED_ACTIVE_TARGET_SESSION_INDEX,
  key: { targetType: 1, targetId: 1 },
  unique: true,
  partialFilterExpression: {
    isCurrent: true,
    targetType: { $exists: true },
    targetId: { $exists: true },
  },
} satisfies MongoIndexDescription);

export const typedActiveTargetRequestIndex = Object.freeze({
  name: TYPED_ACTIVE_TARGET_REQUEST_INDEX,
  key: { targetType: 1, targetId: 1 },
  unique: true,
  partialFilterExpression: { isActive: true, targetType: { $exists: true }, targetId: { $exists: true } },
} satisfies MongoIndexDescription);

const sameKey = (left: Record<string, number>, right: Record<string, number>) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Pure inspection policy for the operator-run, read-only migration preflight.
 * It intentionally contains no index or document mutation capability.
 */
export const assessCreatorVerificationIndexTransition = (indexes: readonly MongoIndexDescription[]) => {
  const legacy = indexes.find((index) => index.name === LEGACY_ACTIVE_PROFILE_SESSION_INDEX);
  const typed = indexes.find((index) => index.name === TYPED_ACTIVE_TARGET_SESSION_INDEX);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!legacy) {
    errors.push(`Missing legacy active-session index ${LEGACY_ACTIVE_PROFILE_SESSION_INDEX}; inspect the deployed index set before planning a transition.`);
  } else if (!legacy.unique || !sameKey(legacy.key, { profileId: 1 })) {
    errors.push(`Legacy index ${LEGACY_ACTIVE_PROFILE_SESSION_INDEX} does not match the expected unique profileId active-session constraint.`);
  }

  if (typed && (!typed.unique || !sameKey(typed.key, typedActiveTargetSessionIndex.key))) {
    errors.push(`Existing index ${TYPED_ACTIVE_TARGET_SESSION_INDEX} has an incompatible definition.`);
  }
  if (!typed) warnings.push(`Replacement index ${TYPED_ACTIVE_TARGET_SESSION_INDEX} is absent; Creator sessions must remain disabled.`);
  if (legacy && typed) warnings.push("Both legacy and replacement indexes are present; Creator sessions remain disabled until legacy profileId uniqueness is retired in an approved maintenance window.");

  return { readyForApprovedCutover: errors.length === 0 && Boolean(typed), errors, warnings };
};

/** The request-side equivalent is deliberately separate so current sessions
 * and active requests can be inspected from their respective collections. */
export const assessCreatorVerificationRequestIndexTransition = (indexes: readonly MongoIndexDescription[]) => {
  const legacy = indexes.find((index) => index.name === LEGACY_ACTIVE_PROFILE_REQUEST_INDEX);
  const typed = indexes.find((index) => index.name === TYPED_ACTIVE_TARGET_REQUEST_INDEX);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!legacy) {
    errors.push(`Missing legacy active-request index ${LEGACY_ACTIVE_PROFILE_REQUEST_INDEX}; inspect the deployed index set before planning a transition.`);
  } else if (!legacy.unique || !sameKey(legacy.key, { profileId: 1 })) {
    errors.push(`Legacy index ${LEGACY_ACTIVE_PROFILE_REQUEST_INDEX} does not match the expected unique profileId active-request constraint.`);
  }
  if (typed && (!typed.unique || !sameKey(typed.key, typedActiveTargetRequestIndex.key))) {
    errors.push(`Existing index ${TYPED_ACTIVE_TARGET_REQUEST_INDEX} has an incompatible definition.`);
  }
  if (!typed) warnings.push(`Replacement index ${TYPED_ACTIVE_TARGET_REQUEST_INDEX} is absent; Creator requests must remain disabled.`);
  if (legacy && typed) warnings.push("Both legacy and replacement request indexes are present; Creator requests remain disabled until legacy profileId uniqueness is retired in an approved maintenance window.");

  return { readyForApprovedCutover: errors.length === 0 && Boolean(typed), errors, warnings };
};
