import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { startDedicatedProfileVerificationWorker } from "../../services/profile/profileVerificationDedicatedWorker.service";
import { createProfileVerificationWorker } from "../../services/profile/profileVerificationWorker.service";

test("dedicated worker connects, starts the canonical worker once, and shuts down gracefully", async () => {
  const events: string[] = [];
  const signals = new Map<string, () => void>();
  let stopped = 0;
  const runtime = await startDedicatedProfileVerificationWorker({
    workerEnabled: true,
    mongoUri: "mongodb://dedicated-test",
    connectMongo: async (uri) => { events.push(`connect:${uri}`); },
    disconnectMongo: async () => { events.push("disconnect"); },
    startWorker: () => { events.push("start"); return {} as ReturnType<typeof import("../../services/profile/profileVerificationWorker.service").startProfileVerificationWorker>; },
    stopWorker: async () => { stopped += 1; events.push("stop"); },
    registerSignal: (signal, listener) => { signals.set(signal, listener); },
    reportLifecycle: (stage) => { events.push(stage); },
    log: () => undefined,
  });
  assert.deepEqual(events, ["connect:mongodb://dedicated-test", "start"]);
  assert.deepEqual([...signals.keys()], ["SIGINT", "SIGTERM"]);
  signals.get("SIGTERM")?.();
  await runtime.shutdown("SIGTERM");
  await runtime.shutdown("SIGTERM");
  assert.equal(stopped, 1);
  assert.deepEqual(events, ["connect:mongodb://dedicated-test", "start", "PROCESS_SIGTERM", "stop", "disconnect"]);
});

test("dedicated worker fails closed without explicit worker authority or Mongo configuration", async () => {
  await assert.rejects(startDedicatedProfileVerificationWorker({ workerEnabled: false, mongoUri: "mongodb://unused" }), /requires STHN_PROFILE_VERIFICATION_WORKER_ENABLED=true/);
  await assert.rejects(startDedicatedProfileVerificationWorker({ workerEnabled: true, mongoUri: "" }), /requires MONGODB_URI/);
});

test("dedicated entrypoint has no server, HTTP, Socket.IO, route, or unrelated-job imports", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../profileVerificationWorker.ts"), "utf8");
  const bootstrap = fs.readFileSync(path.resolve(__dirname, "../../services/profile/profileVerificationDedicatedWorker.service.ts"), "utf8");
  assert.equal(/server|express|socket\.io|routes|\/jobs\//i.test(`${source}\n${bootstrap}`), false);
  assert.match(bootstrap, /startProfileVerificationWorker/);
});

test("canonical worker processes one job at a time", async () => {
  let active = 0; let maximumActive = 0; let calls = 0;
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const processNext = (async () => {
    active += 1; maximumActive = Math.max(maximumActive, active); calls += 1;
    if (calls === 1) await first;
    active -= 1;
    return null;
  }) as never;
  const worker = createProfileVerificationWorker({ idlePollMs: 1, processNext });
  void worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await worker.stop();
  assert.equal(maximumActive, 1);
});
