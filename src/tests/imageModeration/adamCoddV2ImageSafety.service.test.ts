import assert from "node:assert/strict";
import test from "node:test";

import { ADAMCODD_V2_RUNTIME_AUTHORITY } from "../../evaluation/imageModeration/adamCoddV2RuntimeAuthority";
import {
  AdamCoddV2ImageSafetyService,
  AdamCoddV2Session,
  adamCoddV2DecisionFromNsfwProbability,
  verifyAdamCoddV2ArtifactBytes,
} from "../../services/imageModeration/adamCoddV2ImageSafety.service";

const metadata = { name: "pixel_values", type: "float32", shape: ["batch_size", 3, 384, 384] } as const;
const outputMetadata = { name: "logits", type: "float32", shape: ["batch_size", 2] } as const;
const source = Buffer.from("validated-original-image-bytes");

const serviceWith = (logits: Float32Array, options: {
  delay?: Promise<void>;
  createCount?: { value: number };
  active?: { value: number; maximum: number };
  session?: Partial<AdamCoddV2Session>;
  preprocessFailure?: boolean;
  runFailure?: boolean;
  outputDisposeCount?: { value: number };
  tensorDisposeCount?: { value: number };
  inferenceCapacity?: { maxConcurrent: number; maxQueued: number };
  gateEvents?: Array<"ACTIVE" | "QUEUED" | "REJECTED" | "RELEASED">;
} = {}) => new AdamCoddV2ImageSafetyService({
  modelPath: "models/adamcodd-v2/model_int8.onnx",
  readArtifact: async () => Buffer.from("synthetic-artifact"),
  verifyArtifact: () => undefined,
  preprocessor: {
    preprocessOriginal: async () => {
      if (options.preprocessFailure) throw new Error("preprocess failed");
      return { data: new Float32Array(3 * 384 * 384), shape: [1, 3, 384, 384] as const, digest: "synthetic", min: -1, max: 1, mean: 0 };
    },
  },
  createTensor: (() => ({ dispose: () => { if (options.tensorDisposeCount) options.tensorDisposeCount.value += 1; } })) as never,
  inferenceCapacity: options.inferenceCapacity,
  observer: options.gateEvents ? { onInferenceGate: (event) => options.gateEvents?.push(event) } : undefined,
  createSession: async () => {
    if (options.createCount) options.createCount.value += 1;
    return {
      inputNames: ["pixel_values"],
      outputNames: ["logits"],
      inputMetadata: [metadata],
      outputMetadata: [outputMetadata],
      run: async () => {
        if (options.active) {
          options.active.value += 1;
          options.active.maximum = Math.max(options.active.maximum, options.active.value);
        }
        try {
          if (options.runFailure) throw new Error("inference failed");
          await options.delay;
          return { logits: { data: logits, dispose: () => { if (options.outputDisposeCount) options.outputDisposeCount.value += 1; } } };
        } finally {
          if (options.active) options.active.value -= 1;
        }
      },
      ...options.session,
    };
  },
});

test("I3B-3 returns bounded V2 PASS and BLOCK decisions using the frozen threshold", async () => {
  assert.deepEqual(await serviceWith(new Float32Array([2, -2])).classify(source), { decision: "PASS", reasonCode: "IMAGE_POLICY" });
  assert.deepEqual(await serviceWith(new Float32Array([-2, 2])).classify(source), { decision: "BLOCK", reasonCode: "IMAGE_POLICY" });
  assert.equal(adamCoddV2DecisionFromNsfwProbability(ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold), "BLOCK");
  assert.equal(adamCoddV2DecisionFromNsfwProbability(ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold - Number.EPSILON), "PASS");
});

test("I3B-3 uses numerically stable softmax for extreme logits", async () => {
  assert.deepEqual(await serviceWith(new Float32Array([-10_000, 10_000])).classify(source), { decision: "BLOCK", reasonCode: "IMAGE_POLICY" });
  assert.deepEqual(await serviceWith(new Float32Array([10_000, -10_000])).classify(source), { decision: "PASS", reasonCode: "IMAGE_POLICY" });
});

test("I3B-3 validates frozen artifact identity and missing artifacts fail closed", async () => {
  assert.throws(() => verifyAdamCoddV2ArtifactBytes(Buffer.from("not-a-model")), /integrity validation failed/);
  assert.throws(() => verifyAdamCoddV2ArtifactBytes(Buffer.alloc(ADAMCODD_V2_RUNTIME_AUTHORITY.artifactBytes)), /integrity validation failed/);
  const service = new AdamCoddV2ImageSafetyService({
    modelPath: null,
    preprocessor: {
      preprocessOriginal: async () => ({ data: new Float32Array(3 * 384 * 384), shape: [1, 3, 384, 384] as const, digest: "synthetic", min: -1, max: 1, mean: 0 }),
    },
  });
  assert.deepEqual(await service.classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
});

test("I3B-3 rejects invalid session metadata, logits, preprocessing, and inference without V1 fallback", async () => {
  assert.deepEqual(await serviceWith(new Float32Array([1, 2]), { session: { inputMetadata: [{ ...metadata, name: "wrong" }] } }).classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
  assert.deepEqual(await serviceWith(new Float32Array([1, 2]), { session: { outputMetadata: [{ ...outputMetadata, shape: ["batch_size", 3] }] } }).classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
  assert.deepEqual(await serviceWith(new Float32Array([Number.NaN, 0])).classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
  assert.deepEqual(await serviceWith(new Float32Array([Number.POSITIVE_INFINITY, 0])).classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
  assert.deepEqual(await serviceWith(new Float32Array([1, 2]), { preprocessFailure: true }).classify(source), { decision: "UNAVAILABLE", reasonCode: "INVALID_IMAGE" });
  assert.deepEqual(await serviceWith(new Float32Array([1, 2]), { runFailure: true }).classify(source), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
});

test("I3B-3 initializes one V2 session, bounds active and queued work, and releases resources", async () => {
  let release: (() => void) | undefined;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  const created = { value: 0 };
  const active = { value: 0, maximum: 0 };
  const outputDisposed = { value: 0 };
  const tensorDisposed = { value: 0 };
  const service = serviceWith(new Float32Array([2, -2]), { delay, createCount: created, active, outputDisposeCount: outputDisposed, tensorDisposeCount: tensorDisposed });
  const pending = Promise.all(Array.from({ length: 11 }, () => service.classify(source)));
  while (active.value < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active.maximum, 2);
  release?.();
  const results = await pending;
  assert.equal(created.value, 1);
  assert.equal(results.filter((result) => result.decision === "PASS").length, 10);
  assert.equal(results.filter((result) => result.decision === "UNAVAILABLE").length, 1);
  assert.equal(outputDisposed.value, 10);
  assert.equal(tensorDisposed.value, 10);
});

test("I3B-5C accepts only valid local capacity and thread-tuning overrides", async () => {
  assert.throws(() => new AdamCoddV2ImageSafetyService({ sessionTuning: { intraOpNumThreads: 0 } }), /thread tuning is invalid/);
  assert.throws(() => new AdamCoddV2ImageSafetyService({ inferenceCapacity: { maxConcurrent: 0, maxQueued: 8 } }), /inference capacity is invalid/);
  let release: (() => void) | undefined;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  const active = { value: 0, maximum: 0 };
  const service = serviceWith(new Float32Array([2, -2]), { delay, active, inferenceCapacity: { maxConcurrent: 1, maxQueued: 1 } });
  const pending = Promise.all(Array.from({ length: 3 }, () => service.classify(source)));
  while (active.value < 1) await new Promise((resolve) => setImmediate(resolve));
  release?.();
  const results = await pending;
  assert.equal(results.filter((result) => result.decision === "PASS").length, 2);
  assert.equal(results.filter((result) => result.decision === "UNAVAILABLE").length, 1);
});

test("I3B-5E exposes local gate telemetry without changing bounded outcomes", async () => {
  let release: (() => void) | undefined;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  const gateEvents: Array<"ACTIVE" | "QUEUED" | "REJECTED" | "RELEASED"> = [];
  const service = serviceWith(new Float32Array([2, -2]), { delay, gateEvents, inferenceCapacity: { maxConcurrent: 1, maxQueued: 1 } });
  const pending = Promise.all(Array.from({ length: 3 }, () => service.classify(source)));
  while (!gateEvents.includes("ACTIVE")) await new Promise((resolve) => setImmediate(resolve));
  release?.();
  const results = await pending;
  assert.equal(results.filter((result) => result.decision === "PASS").length, 2);
  assert.equal(results.filter((result) => result.decision === "UNAVAILABLE").length, 1);
  assert.equal(gateEvents.filter((event) => event === "ACTIVE").length, 1);
  assert.equal(gateEvents.filter((event) => event === "QUEUED").length, 1);
  assert.equal(gateEvents.filter((event) => event === "REJECTED").length, 1);
  assert.equal(gateEvents.filter((event) => event === "RELEASED").length, 2);
});
