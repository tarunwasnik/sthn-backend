import assert from "node:assert/strict";
import test from "node:test";
import { readMediaCleanupWorkerExecutionConfig } from "../../config/mediaCleanupWorkerExecution";
import { createMediaCleanupScheduler } from "../../services/mediaCleanupScheduler.service";

const config = (overrides: Partial<ReturnType<typeof readMediaCleanupWorkerExecutionConfig>> = {}) => ({ temporaryEnabled: false, profileMediaEnabled: false, temporaryIntervalMs: 10_000, profileMediaIntervalMs: 10_000, temporaryBatchSize: 2, profileMediaBatchSize: 2, ...overrides });

test("cleanup execution is disabled by default and malformed configuration fails closed", () => {
  assert.deepEqual(readMediaCleanupWorkerExecutionConfig({}), config({ temporaryIntervalMs: 300_000, profileMediaIntervalMs: 300_000, temporaryBatchSize: 20, profileMediaBatchSize: 20 }));
  assert.throws(() => readMediaCleanupWorkerExecutionConfig({ STHN_TEMPORARY_IMAGE_CLEANUP_ENABLED: "yes" }), /exactly true or false/);
  assert.throws(() => readMediaCleanupWorkerExecutionConfig({ STHN_PROFILE_MEDIA_CLEANUP_INTERVAL_MS: "9" }), /between 10000 and 3600000/);
});

test("independent flags schedule neither worker until enabled and never invoke disabled cleanup", async () => {
  let temporaryCalls = 0, profileCalls = 0; const timers: Array<() => void> = [];
  const scheduler = createMediaCleanupScheduler({ config: config({ temporaryEnabled: true }), temporaryJob: async () => { temporaryCalls += 1; return { reconciliation: { recovered: 0, contained: 0 }, results: [] }; }, profileJob: async () => { profileCalls += 1; return []; }, setInterval: (callback) => { timers.push(callback); return {} as NodeJS.Timeout; }, clearInterval: () => undefined, report: () => undefined });
  assert.deepEqual(scheduler.start(), { temporaryEnabled: true, profileMediaEnabled: false });
  assert.equal(temporaryCalls, 0); assert.equal(profileCalls, 0); assert.equal(timers.length, 1);
  timers[0](); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(temporaryCalls, 1); assert.equal(profileCalls, 0); await scheduler.stop();
});

test("local overlap is suppressed, worker errors are contained, and shutdown cancels future timers", async () => {
  let resolveWork: (() => void) | undefined; let calls = 0; const events: string[] = []; const timers: Array<() => void> = []; let cleared = 0;
  const scheduler = createMediaCleanupScheduler({ config: config({ profileMediaEnabled: true }), temporaryJob: async () => ({ reconciliation: { recovered: 0, contained: 0 }, results: [] }), profileJob: async () => { calls += 1; await new Promise<void>((resolve) => { resolveWork = resolve; }); return []; }, setInterval: (callback) => { timers.push(callback); return {} as NodeJS.Timeout; }, clearInterval: () => { cleared += 1; }, report: (event) => events.push(event) });
  scheduler.start(); const first = scheduler.runProfileNow(); const second = await scheduler.runProfileNow();
  assert.equal(second, false); assert.equal(calls, 1); assert.ok(events.includes("overlap_skipped"));
  resolveWork?.(); await first; await scheduler.stop(); assert.equal(cleared, 1); assert.equal(scheduler.isRunning(), false);
  const failing = createMediaCleanupScheduler({ config: config({ temporaryEnabled: true }), temporaryJob: async () => { throw new Error("contained"); }, profileJob: async () => [], report: (event) => events.push(event) });
  assert.equal(await failing.runTemporaryNow(), true); assert.ok(events.includes("invocation_failed"));
});
