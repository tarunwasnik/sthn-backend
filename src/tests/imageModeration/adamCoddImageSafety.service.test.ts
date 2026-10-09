import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { ADAMCODD_RUNTIME_AUTHORITY } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";
import { resolveAdamCoddModelPath } from "../../services/imageModeration/adamCoddImageSafety.config";
import { AdamCoddImageSafetyService, verifyAdamCoddArtifactBytes } from "../../services/imageModeration/adamCoddImageSafety.service";

const fixtureArtifactPath = path.resolve(process.cwd(), "evaluation-cache/image-moderation/adamcodd-vit-base-nsfw-detector/8587de998f441aac03fdd57a85d2e4cb808c7d64/onnx/model_int8.onnx");
const metadata = { name: "pixel_values", type: "float32", shape: ["batch_size", "num_channels", "height", "width"] } as const;
const outputMetadata = { name: "logits", type: "float32", shape: ["batch_size", 2] } as const;
const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 32, g: 64, b: 96 } } }).png().toBuffer();

const serviceWith = (logits: readonly number[], options: { delay?: Promise<void>; createCount?: { value: number }; active?: { value: number; maximum: number } } = {}) => new AdamCoddImageSafetyService({
  modelPath: "models/adamcodd/model_int8.onnx",
  readArtifact: () => readFile(fixtureArtifactPath),
  createTensor: (() => ({ dispose() {} })) as never,
  createSession: async () => {
    if (options.createCount) options.createCount.value += 1;
    return {
      inputNames: ["pixel_values"], outputNames: ["logits"], inputMetadata: [metadata], outputMetadata: [outputMetadata],
      run: async () => {
        if (options.active) { options.active.value += 1; options.active.maximum = Math.max(options.active.maximum, options.active.value); }
        try { await options.delay; return { logits: { data: new Float32Array(logits), dispose() {} } }; }
        finally { if (options.active) options.active.value -= 1; }
      },
    };
  },
});

test("I2 verifies the exact frozen artifact identity", async () => {
  const artifact = await readFile(fixtureArtifactPath);
  assert.equal(artifact.length, ADAMCODD_RUNTIME_AUTHORITY.artifactBytes);
  assert.doesNotThrow(() => verifyAdamCoddArtifactBytes(artifact));
  assert.throws(() => verifyAdamCoddArtifactBytes(Buffer.from("not-a-model")));
});

test("I2 retains frozen PASS and BLOCK argmax semantics", async () => {
  assert.deepEqual(await serviceWith([3, 1]).classify(await image()), { decision: "PASS", reasonCode: "IMAGE_POLICY" });
  assert.deepEqual(await serviceWith([1, 3]).classify(await image()), { decision: "BLOCK", reasonCode: "IMAGE_POLICY" });
});

test("I2 returns UNAVAILABLE without a false PASS when model initialization fails", async () => {
  const service = new AdamCoddImageSafetyService({ modelPath: null });
  assert.deepEqual(await service.classify(await image()), { decision: "UNAVAILABLE", reasonCode: "IMAGE_SAFETY_UNAVAILABLE" });
});

test("I2 rejects undecodable bytes without loading a model", async () => {
  let loaded = false;
  const service = new AdamCoddImageSafetyService({ modelPath: "models/adamcodd/model_int8.onnx", readArtifact: async () => { loaded = true; return Buffer.alloc(0); } });
  assert.deepEqual(await service.classify(Buffer.from("not an image")), { decision: "UNAVAILABLE", reasonCode: "INVALID_IMAGE" });
  assert.equal(loaded, false);
});

test("I2 shares a single model initialization and bounds concurrent inference", async () => {
  let release: (() => void) | undefined;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  const created = { value: 0 }; const active = { value: 0, maximum: 0 };
  const service = serviceWith([3, 1], { delay, createCount: created, active });
  const pending = Promise.all(Array.from({ length: 4 }, async () => service.classify(await image())));
  while (active.value < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active.maximum, 2); assert.equal(created.value, 1);
  release?.();
  for (const result of await pending) assert.equal(result.decision, "PASS");
  assert.equal(created.value, 1);
});

test("I2 has no evaluation-cache production fallback", () => {
  assert.equal(resolveAdamCoddModelPath(undefined), null);
  assert.equal(resolveAdamCoddModelPath("evaluation-cache/image-moderation/model.onnx"), null);
  assert.match(resolveAdamCoddModelPath("models/adamcodd/model_int8.onnx") ?? "", /models[\\/]adamcodd[\\/]model_int8\.onnx$/);
});
