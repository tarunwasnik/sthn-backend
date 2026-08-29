import assert from "node:assert/strict";
import { test } from "node:test";

import { createProfileVerificationWorker } from "../../services/profile/profileVerificationWorker.service";

test("profile verification worker drains sequential jobs and waits only when idle", async () => {
  let worker: ReturnType<typeof createProfileVerificationWorker>;
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  let waits = 0;
  worker = createProfileVerificationWorker({
    workerId: "test-worker",
    processNext: async () => {
      active += 1; maximumActive = Math.max(maximumActive, active);
      calls += 1;
      active -= 1;
      return calls < 3 ? {} as Awaited<ReturnType<typeof import("../../services/profile/profileVerificationJob.service").processNextProfileVerificationJob>> : null;
    },
    wait: async () => { waits += 1; void worker.stop(); },
  });
  await worker.start();
  assert.equal(calls, 3);
  assert.equal(maximumActive, 1);
  assert.equal(waits, 1);
  assert.equal(worker.isRunning(), false);
});

test("profile verification worker contains iteration failures and remains able to poll", async () => {
  let worker: ReturnType<typeof createProfileVerificationWorker>;
  let calls = 0;
  const errors: unknown[] = [];
  worker = createProfileVerificationWorker({
    processNext: async () => {
      calls += 1;
      if (calls === 1) throw new Error("controlled iteration failure");
      return null;
    },
    reportError: (error) => errors.push(error),
    wait: async () => { void worker.stop(); },
  });
  await worker.start();
  assert.equal(calls, 1);
  assert.equal(errors.length, 1);
});

test("profile verification worker start is idempotent within one process", async () => {
  let worker: ReturnType<typeof createProfileVerificationWorker>;
  let calls = 0;
  worker = createProfileVerificationWorker({
    processNext: async () => { calls += 1; return null; },
    wait: async () => { void worker.stop(); },
  });
  const first = worker.start();
  const second = worker.start();
  assert.equal(first, second);
  await first;
  assert.equal(calls, 1);
});
