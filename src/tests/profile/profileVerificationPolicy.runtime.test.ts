import assert from "node:assert/strict";
import { test } from "node:test";

import { GATED_PROFILE_VERIFICATION_POLICY, GATED_PROFILE_VERIFICATION_POLICY_V2, GATED_PROFILE_VERIFICATION_POLICY_V3, LEGACY_PROFILE_VERIFICATION_POLICY, hasGatedAutomatedDecisionAuthority, isGatedProfileVerificationPolicy, parseNewProfileVerificationPolicy, resolveProfileVerificationPolicy } from "../../services/profile/profileVerificationPolicy.service";
import { createProfileVerificationSubmittedMediaSnapshot, requireProfilePhotoCountForVerificationPolicy } from "../../services/profile/profileVerificationSubmittedMedia.service";

test("missing historical request policy resolves only to legacy", () => {
  assert.deepEqual(resolveProfileVerificationPolicy({ verificationPolicy: undefined } as never), LEGACY_PROFILE_VERIFICATION_POLICY);
  assert.equal(isGatedProfileVerificationPolicy(resolveProfileVerificationPolicy({ verificationPolicy: undefined } as never)), false);
});

test("all verification policies enforce the shared 2–6 gallery range", () => {
  for (const policy of [LEGACY_PROFILE_VERIFICATION_POLICY, GATED_PROFILE_VERIFICATION_POLICY, GATED_PROFILE_VERIFICATION_POLICY_V2, GATED_PROFILE_VERIFICATION_POLICY_V3]) {
    for (const count of [2, 3, 6]) {
      assert.doesNotThrow(() => requireProfilePhotoCountForVerificationPolicy(Array.from({ length: count }, (_, index) => `photo-${index}`), policy));
    }
    for (const count of [0, 1, 7]) {
      assert.throws(() => requireProfilePhotoCountForVerificationPolicy(Array.from({ length: count }, (_, index) => `photo-${index}`), policy), (error: unknown) => {
        const validation = error as { statusCode?: number; code?: string; message?: string };
        return validation.statusCode === 400 && validation.code === "PROFILE_PHOTO_COUNT_INVALID" && validation.message === "Profile gallery must contain between 2 and 6 images for verification";
      });
    }
  }
});

test("submitted-media snapshots require avatar, cover, and a 2–6 gallery", () => {
  for (const count of [2, 3, 6]) {
    assert.doesNotThrow(() => createProfileVerificationSubmittedMediaSnapshot({ avatar: "avatar", cover: "cover", profilePhotos: Array.from({ length: count }, (_, index) => `photo-${index}`) }, GATED_PROFILE_VERIFICATION_POLICY_V3));
  }
  for (const count of [0, 1, 7]) {
    assert.throws(() => createProfileVerificationSubmittedMediaSnapshot({ avatar: "avatar", cover: "cover", profilePhotos: Array.from({ length: count }, (_, index) => `photo-${index}`) }, GATED_PROFILE_VERIFICATION_POLICY_V3));
  }
  assert.throws(() => createProfileVerificationSubmittedMediaSnapshot({ avatar: "", cover: "cover", profilePhotos: ["one", "two"] }, GATED_PROFILE_VERIFICATION_POLICY_V3));
  assert.throws(() => createProfileVerificationSubmittedMediaSnapshot({ avatar: "avatar", cover: "", profilePhotos: ["one", "two"] }, GATED_PROFILE_VERIFICATION_POLICY_V3));
});

test("new-request policy parsing defaults to V3 and rejects malformed values", () => {
  assert.deepEqual(parseNewProfileVerificationPolicy(undefined), GATED_PROFILE_VERIFICATION_POLICY_V3);
  assert.deepEqual(parseNewProfileVerificationPolicy(null), GATED_PROFILE_VERIFICATION_POLICY_V3);
  assert.deepEqual(parseNewProfileVerificationPolicy(""), GATED_PROFILE_VERIFICATION_POLICY_V3);
  assert.deepEqual(parseNewProfileVerificationPolicy("GATED_MULTI_MEDIA_V1"), GATED_PROFILE_VERIFICATION_POLICY);
  assert.deepEqual(parseNewProfileVerificationPolicy("GATED_MULTI_MEDIA_V2"), GATED_PROFILE_VERIFICATION_POLICY_V2);
  assert.equal(isGatedProfileVerificationPolicy(GATED_PROFILE_VERIFICATION_POLICY_V2), true);
  assert.equal(hasGatedAutomatedDecisionAuthority(GATED_PROFILE_VERIFICATION_POLICY), false);
  assert.equal(hasGatedAutomatedDecisionAuthority(GATED_PROFILE_VERIFICATION_POLICY_V2), true);
  assert.deepEqual(parseNewProfileVerificationPolicy("LEGACY_AVATAR_ONLY_V1"), LEGACY_PROFILE_VERIFICATION_POLICY);
  assert.throws(() => parseNewProfileVerificationPolicy("unexpected"));
  assert.throws(() => parseNewProfileVerificationPolicy("GATED_MULTI_MEDIA_V2_BETA"), /must be LEGACY_AVATAR_ONLY_V1, GATED_MULTI_MEDIA_V1, GATED_MULTI_MEDIA_V2, or GATED_MULTI_MEDIA_V3/);
});
