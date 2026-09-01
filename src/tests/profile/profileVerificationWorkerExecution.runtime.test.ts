import assert from "node:assert/strict";
import { test } from "node:test";

import { parseProfileVerificationWorkerEnabled } from "../../config/profileVerificationWorkerExecution";
import { startProfileVerificationWorkerIfEnabled } from "../../services/profile/profileVerificationWorkerBootstrap.service";

test("profile-verification worker execution config is disabled when absent or explicitly false", () => {
  assert.equal(parseProfileVerificationWorkerEnabled(undefined), false);
  assert.equal(parseProfileVerificationWorkerEnabled("false"), false);
});

test("profile-verification worker execution config is enabled only by explicit true", () => {
  assert.equal(parseProfileVerificationWorkerEnabled("true"), true);
});

test("profile-verification worker execution config fails closed for malformed explicit values", () => {
  assert.throws(() => parseProfileVerificationWorkerEnabled("yes"), /must be exactly true or false/);
  assert.throws(() => parseProfileVerificationWorkerEnabled(""), /must be exactly true or false/);
});

test("profile-verification worker execution authority is captured once for the process lifetime", () => {
  const modulePath = require.resolve("../../config/profileVerificationWorkerExecution");
  const original = process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED;
  try {
    process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED = "true";
    delete require.cache[modulePath];
    const { PROFILE_VERIFICATION_WORKER_ENABLED } = require("../../config/profileVerificationWorkerExecution") as typeof import("../../config/profileVerificationWorkerExecution");
    process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED = "false";
    assert.equal(PROFILE_VERIFICATION_WORKER_ENABLED, true);
  } finally {
    if (original === undefined) delete process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED;
    else process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED = original;
    delete require.cache[modulePath];
  }
});

test("worker bootstrap does not start when disabled or absent", () => {
  let starts = 0;
  assert.equal(startProfileVerificationWorkerIfEnabled({ workerEnabled: false, startWorker: () => { starts += 1; return {} as ReturnType<typeof import("../../services/profile/profileVerificationWorker.service").startProfileVerificationWorker>; } }), false);
  assert.equal(startProfileVerificationWorkerIfEnabled({ startWorker: () => { starts += 1; return {} as ReturnType<typeof import("../../services/profile/profileVerificationWorker.service").startProfileVerificationWorker>; } }), false);
  assert.equal(starts, 0);
});

test("worker bootstrap starts exactly once when explicitly enabled", () => {
  let starts = 0;
  assert.equal(startProfileVerificationWorkerIfEnabled({ workerEnabled: true, startWorker: () => { starts += 1; return {} as ReturnType<typeof import("../../services/profile/profileVerificationWorker.service").startProfileVerificationWorker>; } }), true);
  assert.equal(starts, 1);
});
