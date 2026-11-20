import assert from "node:assert/strict";
import { test } from "node:test";
import { isCreatorVerificationEnabled, requireCreatorVerificationEnabled } from "../../services/creator/creatorVerificationFeatureGate";

test("Creator verification is disabled by default", () => {
  const enabled = process.env.STHN_CREATOR_VERIFICATION_ENABLED;
  const ready = process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY;
  delete process.env.STHN_CREATOR_VERIFICATION_ENABLED;
  delete process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY;
  assert.equal(isCreatorVerificationEnabled(), false);
  assert.throws(() => requireCreatorVerificationEnabled(), { statusCode: 503 });
  if (enabled === undefined) delete process.env.STHN_CREATOR_VERIFICATION_ENABLED; else process.env.STHN_CREATOR_VERIFICATION_ENABLED = enabled;
  if (ready === undefined) delete process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY; else process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY = ready;
});
