import assert from "node:assert/strict";
import { test } from "node:test";

import { assessCreatorVerificationIndexTransition, assessCreatorVerificationRequestIndexTransition, LEGACY_ACTIVE_PROFILE_REQUEST_INDEX, LEGACY_ACTIVE_PROFILE_SESSION_INDEX, TYPED_ACTIVE_TARGET_REQUEST_INDEX, TYPED_ACTIVE_TARGET_SESSION_INDEX } from "../../services/creator/creatorVerificationIndexTransition";

test("Creator verification index transition remains disabled until the typed replacement exists", () => {
  const assessment = assessCreatorVerificationIndexTransition([
    { name: LEGACY_ACTIVE_PROFILE_SESSION_INDEX, key: { profileId: 1 }, unique: true, partialFilterExpression: { isCurrent: true } },
  ]);
  assert.equal(assessment.readyForApprovedCutover, false);
  assert.match(assessment.warnings.join(" "), new RegExp(TYPED_ACTIVE_TARGET_SESSION_INDEX));
});

test("Creator verification index transition rejects an incompatible replacement index", () => {
  const assessment = assessCreatorVerificationIndexTransition([
    { name: LEGACY_ACTIVE_PROFILE_SESSION_INDEX, key: { profileId: 1 }, unique: true },
    { name: TYPED_ACTIVE_TARGET_SESSION_INDEX, key: { targetId: 1 }, unique: true },
  ]);
  assert.equal(assessment.readyForApprovedCutover, false);
  assert.match(assessment.errors.join(" "), /incompatible/);
});

test("active Creator requests remain disabled until their typed replacement exists", () => {
  const assessment = assessCreatorVerificationRequestIndexTransition([
    { name: LEGACY_ACTIVE_PROFILE_REQUEST_INDEX, key: { profileId: 1 }, unique: true, partialFilterExpression: { isActive: true } },
  ]);
  assert.equal(assessment.readyForApprovedCutover, false);
  assert.match(assessment.warnings.join(" "), new RegExp(TYPED_ACTIVE_TARGET_REQUEST_INDEX));
});
