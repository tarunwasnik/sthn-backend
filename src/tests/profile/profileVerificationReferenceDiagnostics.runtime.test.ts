import assert from "node:assert/strict";
import { test } from "node:test";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "node:path";
// Isolated test process: use the tracked artifact without requiring a developer .env.
process.env.STHN_YUNET_MODEL_PATH = path.resolve(__dirname, "../../../models/face_detection_yunet_2026may.onnx");
import { logger } from "../../utils/logger";
import { detectYuNetFaces, resetYuNetRunnerForTests } from "../../services/profile/profileVerificationYuNetRunner";
import { validateBiometricReferenceAvatar } from "../../services/profile/profileVerificationReferenceAvatarValidation.service";

const input = { profileId: "private-profile", userId: "private-user", avatarFingerprint: "private-fingerprint" };
const outputFor = (kind: string) => {
  const output: Record<string, { data: Float32Array }> = {};
  for (const [stride, count] of [[8, 16], [16, 4], [32, 1]]) {
    const cls = new Float32Array(count).fill(0.64);
    const bbox = new Float32Array(count * 4);
    const kps = new Float32Array(count * 10);
    if (stride === 8 && kind !== "NO_FACE") {
      for (let i = 0; i < (kind === "MULTIPLE_FACES" ? 2 : 1); i += 1) {
        cls[i] = 0.9;
        bbox[i * 4] = 2; bbox[i * 4 + 1] = 2;
        bbox[i * 4 + 2] = Math.log((kind === "INVALID_GEOMETRY" ? 1 : 12) / stride);
        bbox[i * 4 + 3] = bbox[i * 4 + 2];
      }
      if (kind === "INVALID_LANDMARKS") kps[0] = Number.NaN;
    }
    output[`cls_${stride}`] = { data: cls };
    output[`obj_${stride}`] = { data: cls };
    output[`bbox_${stride}`] = { data: bbox };
    output[`kps_${stride}`] = { data: kps };
  }
  return output;
};

for (const kind of ["VALID", "NO_FACE", "MULTIPLE_FACES", "INVALID_GEOMETRY", "INVALID_LANDMARKS", "TECHNICAL_FAILURE"]) {
  test(`reference diagnostic: ${kind}, one inference and bounded private output`, async (t) => {
    resetYuNetRunnerForTests();
    const oldRevision = process.env.RENDER_GIT_COMMIT;
    process.env.RENDER_GIT_COMMIT = "a".repeat(40);
    t.after(() => { resetYuNetRunnerForTests(); if (oldRevision === undefined) delete process.env.RENDER_GIT_COMMIT; else process.env.RENDER_GIT_COMMIT = oldRevision; });
    let runs = 0;
    t.mock.method(ort.InferenceSession, "create", async () => ({
      inputNames: ["input"], inputMetadata: [{ isTensor: true, shape: [1, 3, "height", "width"] }],
      run: async () => { runs += 1; if (kind === "TECHNICAL_FAILURE") throw new Error("private failure detail"); return outputFor(kind); },
    }));
    const events: string[] = [];
    t.mock.method(logger, "info", (message: string) => { events.push(message); });
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
    const action = () => validateBiometricReferenceAvatar(input, {
      reader: async () => bytes,
      detector: (buffer, role, _audit, observe) => detectYuNetFaces(buffer, role, false, observe),
    });
    if (kind === "TECHNICAL_FAILURE") {
      await assert.rejects(action(), { name: "ProfileVerificationInferenceError" });
      assert.deepEqual(events, []);
    } else {
      const result = await action();
      assert.deepEqual(result, kind === "VALID" ? { valid: true } : { valid: false, reason: kind });
      assert.equal(events.length, 1);
      const event = JSON.parse(events[0]);
      assert.equal(event.classification, kind);
      assert.equal(event.rawFiniteCandidateCount, 21);
      assert.equal(event.candidatesAtThreshold, kind === "NO_FACE" ? 0 : kind === "MULTIPLE_FACES" ? 2 : 1);
      assert.equal(event.postNmsFaceCount, event.candidatesAtThreshold);
      assert.ok(Math.abs(event.maxRawConfidence - (kind === "NO_FACE" ? 0.64 : 0.9)) < 0.000001);
      assert.deepEqual(Object.keys(event).sort(), ["event", "detectorModelId", "detectorModelVersion", "artifactSha256", "confidenceThreshold", "nmsThreshold", "referenceFaceAreaMin", "referenceFaceAreaMax", "transformedWidth", "transformedHeight", "maxRawConfidence", "rawFiniteCandidateCount", "candidatesAtThreshold", "postNmsFaceCount", "classification", "deploymentRevision"].sort());
      assert.equal(event.confidenceThreshold, 0.65);
      assert.equal(event.nmsThreshold, 0.30);
      assert.equal(event.referenceFaceAreaMin, 0.03);
      assert.equal(event.referenceFaceAreaMax, 0.65);
      assert.equal(event.deploymentRevision, "a".repeat(40));
      assert.doesNotMatch(events[0], /private-|https?:|publicId|landmarks|bbox|embedding|tensor|base64/);
    }
    assert.equal(runs, 1);
  });
}

test("reference diagnostics omit unsafe revisions and cannot break validation when logging fails", async (t) => {
  const previous = process.env.RENDER_GIT_COMMIT;
  process.env.RENDER_GIT_COMMIT = "https://private.invalid/not-a-revision";
  t.after(() => { if (previous === undefined) delete process.env.RENDER_GIT_COMMIT; else process.env.RENDER_GIT_COMMIT = previous; });
  const messages: string[] = [];
  t.mock.method(logger, "info", (message: string) => { messages.push(message); throw new Error("logger unavailable"); });
  const result = await validateBiometricReferenceAvatar(input, {
    reader: async () => Buffer.from("private-image"),
    detector: async (_bytes, _role, _audit, observe) => {
      observe?.({ maxRawConfidence: null, rawFiniteCandidateCount: 0, candidatesAtThreshold: 0 });
      return { width: 32, height: 32, decodedBytes: 3072, faces: [] };
    },
  });
  assert.deepEqual(result, { valid: false, reason: "NO_FACE" });
  assert.equal(messages.length, 1);
  assert.equal(JSON.parse(messages[0]).maxRawConfidence, null);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(messages[0]), "deploymentRevision"), false);
  assert.doesNotMatch(messages[0], /private|https?:/);
});
