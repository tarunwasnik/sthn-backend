import assert from "node:assert/strict";
import { test } from "node:test";

import { isCreatorVerificationEnabled, requireCreatorVerificationEnabled } from "../../services/creator/creatorVerificationFeatureGate";
import { requireActiveCreator } from "../../middlewares/creator.middleware";

const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

test("deferred direct Creator verification stays disabled even if old flags are enabled", () => {
  const enabled = process.env.STHN_CREATOR_VERIFICATION_ENABLED;
  const ready = process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY;
  try {
    delete process.env.STHN_CREATOR_VERIFICATION_ENABLED;
    delete process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY;
    assert.equal(isCreatorVerificationEnabled(), false);
    assert.throws(() => requireCreatorVerificationEnabled(), { statusCode: 503 });

    process.env.STHN_CREATOR_VERIFICATION_ENABLED = "true";
    process.env.STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY = "true";
    assert.equal(isCreatorVerificationEnabled(), false);
    assert.throws(() => requireCreatorVerificationEnabled(), { statusCode: 503 });
  } finally {
    restore("STHN_CREATOR_VERIFICATION_ENABLED", enabled);
    restore("STHN_CREATOR_VERIFICATION_INDEX_TRANSITION_READY", ready);
  }
});

test("a pending User cannot use protected Creator operations through the dashboard shell", async () => {
  let statusCode = 0;
  let body: unknown;
  let nextCalled = false;
  const response = {
    status: (status: number) => {
      statusCode = status;
      return { json: (payload: unknown) => { body = payload; } };
    },
  };
  await requireActiveCreator(
    { user: { id: "pending-user", role: "user", creatorStatus: "pending" } } as never,
    response as never,
    () => { nextCalled = true; },
  );
  assert.equal(statusCode, 403);
  assert.deepEqual(body, { message: "Creator access required" });
  assert.equal(nextCalled, false);
});
