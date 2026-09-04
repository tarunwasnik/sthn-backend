import assert from "node:assert/strict";
import { test } from "node:test";

import { GATED_PROFILE_VERIFICATION_POLICY, LEGACY_PROFILE_VERIFICATION_POLICY, isGatedProfileVerificationPolicy, parseNewProfileVerificationPolicy, resolveProfileVerificationPolicy } from "../../services/profile/profileVerificationPolicy.service";
import { requireProfilePhotoCountForVerificationPolicy } from "../../services/profile/profileVerificationSubmittedMedia.service";

test("missing historical request policy resolves only to legacy", () => {
  assert.deepEqual(resolveProfileVerificationPolicy({ verificationPolicy: undefined } as never), LEGACY_PROFILE_VERIFICATION_POLICY);
  assert.equal(isGatedProfileVerificationPolicy(resolveProfileVerificationPolicy({ verificationPolicy: undefined } as never)), false);
});

test("gated policy requires exactly six while legacy remains compatible with 2–6", () => {
  assert.doesNotThrow(() => requireProfilePhotoCountForVerificationPolicy(["a", "b"], LEGACY_PROFILE_VERIFICATION_POLICY));
  assert.doesNotThrow(() => requireProfilePhotoCountForVerificationPolicy(["a", "b", "c", "d", "e", "f"], GATED_PROFILE_VERIFICATION_POLICY));
  assert.throws(() => requireProfilePhotoCountForVerificationPolicy(["a", "b", "c", "d", "e"], GATED_PROFILE_VERIFICATION_POLICY));
});

test("new-request policy parsing defaults only when absent and rejects malformed values", () => {
  assert.deepEqual(parseNewProfileVerificationPolicy(undefined), LEGACY_PROFILE_VERIFICATION_POLICY);
  assert.deepEqual(parseNewProfileVerificationPolicy("GATED_MULTI_MEDIA_V1"), GATED_PROFILE_VERIFICATION_POLICY);
  assert.deepEqual(parseNewProfileVerificationPolicy("LEGACY_AVATAR_ONLY_V1"), LEGACY_PROFILE_VERIFICATION_POLICY);
  assert.throws(() => parseNewProfileVerificationPolicy("unexpected"));
});
