import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import {
  createDeterministicTestFaceEmbeddingAdapter,
  getProductionFaceEmbeddingAdapter,
  SFACE_ARTIFACT,
  SFACE_FACE_EMBEDDING_SPECIFICATION,
  TEST_ONLY_FACE_EMBEDDING_SPECIFICATION,
} from "../../services/profile/profileVerificationFaceEmbeddingAdapter";
import {
  alignFaceEvidence,
  calculateFaceSimilarityTransform,
  cosineSimilarity,
  normalizeFaceEmbeddingL2,
  validateEmbeddingVector,
  validateFaceEmbeddingLandmarks,
} from "../../services/profile/profileVerificationFaceEmbedding.service";
import { decodeYuNetOutput } from "../../services/profile/profileVerificationYuNetRunner";
import { analyseSFaceShadowIdentity } from "../../services/profile/profileVerificationSFaceShadowAnalysis.service";

const landmarks = {
  rightEye: { x: 2, y: 2 },
  leftEye: { x: 5, y: 2 },
  noseTip: { x: 3.5, y: 3.5 },
  rightMouthCorner: { x: 2.5, y: 5.5 },
  leftMouthCorner: { x: 4.5, y: 5.5 },
};

const syntheticEvidence = async () => {
  const pixels = Buffer.alloc(8 * 8 * 3);
  for (let pixel = 0; pixel < 64; pixel += 1) {
    pixels[pixel * 3] = pixel;
    pixels[pixel * 3 + 1] = 255 - pixel;
    pixels[pixel * 3 + 2] = (pixel * 17) % 256;
  }
  const bytes = await sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } }).png().toBuffer();
  return { bytes, pixels };
};

test("five-landmark validation preserves the YuNet semantic order and rejects malformed or degenerate input", () => {
  assert.deepEqual(validateFaceEmbeddingLandmarks(landmarks), landmarks);
  assert.throws(() => validateFaceEmbeddingLandmarks({ ...landmarks, noseTip: { x: Number.NaN, y: 1 } }));
  assert.throws(() => validateFaceEmbeddingLandmarks({ ...landmarks, leftMouthCorner: undefined }));
  assert.throws(() => validateFaceEmbeddingLandmarks({
    rightEye: { x: 1, y: 1 }, leftEye: { x: 1, y: 1 }, noseTip: { x: 1, y: 1 }, rightMouthCorner: { x: 1, y: 1 }, leftMouthCorner: { x: 1, y: 1 },
  }));
});

test("YuNet's validated ten-value tensor retains the documented five-landmark semantic order", () => {
  const output: Record<string, { data: Float32Array }> = {};
  for (const stride of [8, 16, 32]) {
    const expected = (32 / stride) * (32 / stride);
    output[`cls_${stride}`] = { data: new Float32Array(expected) };
    output[`obj_${stride}`] = { data: new Float32Array(expected) };
    output[`bbox_${stride}`] = { data: new Float32Array(expected * 4) };
    output[`kps_${stride}`] = { data: new Float32Array(expected * 10) };
  }
  output.cls_8.data[0] = 1;
  output.obj_8.data[0] = 1;
  output.bbox_8.data.set([0, 0, Math.log(2), Math.log(2)]);
  output.kps_8.data.set([1, 2, 3, 2, 2, 3, 1.5, 5, 2.5, 5]);
  const face = decodeYuNetOutput(output, 32, 32, 32, 32)[0];
  assert.deepEqual(face.landmarks, {
    rightEye: { x: 8, y: 16 }, leftEye: { x: 24, y: 16 }, noseTip: { x: 16, y: 24 },
    rightMouthCorner: { x: 12, y: 40 }, leftMouthCorner: { x: 20, y: 40 },
  });
});

test("similarity transform and aligned runtime pixels are deterministic and memory-only", async () => {
  const shifted = Object.fromEntries(Object.entries(landmarks).map(([key, point]) => [key, { x: point.x + 2, y: point.y + 3 }])) as typeof landmarks;
  const transform = calculateFaceSimilarityTransform(shifted, landmarks);
  assert.equal(transform.a, 1);
  assert.ok(Math.abs(transform.b) < 1e-12);
  assert.ok(Math.abs(transform.translateX + 2) < 1e-12);
  assert.ok(Math.abs(transform.translateY + 3) < 1e-12);

  const { bytes, pixels } = await syntheticEvidence();
  const aligned = await alignFaceEvidence({ bytes, landmarks, preprocessing: TEST_ONLY_FACE_EMBEDDING_SPECIFICATION.preprocessing });
  assert.deepEqual(aligned.pixels, pixels);
  assert.deepEqual(Object.keys(aligned).sort(), ["channels", "height", "pixels", "preprocessingIdentifier", "width"]);
  assert.equal(aligned.width, 8);
  assert.equal(aligned.height, 8);
  assert.equal(aligned.channels, 3);
  assert.equal(aligned.preprocessingIdentifier, "TEST_ONLY_SIMILARITY_RGB_8X8_V1");
});

test("embedding output validation, normalization, and cosine similarity reject invalid synthetic values", () => {
  assert.deepEqual(validateEmbeddingVector([3, 4], 2), [3, 4]);
  assert.throws(() => validateEmbeddingVector([], 0));
  assert.throws(() => validateEmbeddingVector([1, Number.NaN], 2));
  assert.throws(() => validateEmbeddingVector([1, Number.POSITIVE_INFINITY], 2));
  assert.throws(() => normalizeFaceEmbeddingL2([0, 0], 2));
  assert.deepEqual(normalizeFaceEmbeddingL2([3, 4], 2), [0.6, 0.8]);
  assert.equal(cosineSimilarity([1, 0], [1, 0], 2), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1], 2), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0], 2), -1);
});

test("the deterministic adapter is test-only and does not stand in for production SFace", async () => {
  const { bytes } = await syntheticEvidence();
  const aligned = await alignFaceEvidence({ bytes, landmarks, preprocessing: TEST_ONLY_FACE_EMBEDDING_SPECIFICATION.preprocessing });
  const adapter = createDeterministicTestFaceEmbeddingAdapter();
  const first = await adapter.infer(aligned);
  const second = await adapter.infer(aligned);
  assert.equal(adapter.specification.identifier, "TEST_ONLY_SYNTHETIC_FACE_EMBEDDING_V1");
  assert.deepEqual(first, second);
  assert.deepEqual(validateEmbeddingVector(first, adapter.specification.expectedDimensions), first);
  assert.notEqual(getProductionFaceEmbeddingAdapter().specification.identifier, adapter.specification.identifier);
});

test("the selected SFace artifact loads with its verified tensor contract and returns a finite normalized embedding", async () => {
  const adapter = getProductionFaceEmbeddingAdapter();
  const pixels = Buffer.alloc(112 * 112 * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 251;
  const input = { pixels, width: 112, height: 112, channels: 3 as const, preprocessingIdentifier: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing.identifier };
  const first = await adapter.infer(input);
  const second = await adapter.infer(input);
  assert.equal(SFACE_ARTIFACT.filename, "face_recognition_sface_2021dec.onnx");
  assert.equal(first.length, 128);
  assert.ok(first.every(Number.isFinite));
  assert.equal(cosineSimilarity(first, second, 128), 1);
});

test("SFace shadow aggregation uses the median, three usable captures, and never fabricates a threshold conclusion", () => {
  const reference = Array.from({ length: 128 }, (_, index) => index === 0 ? 1 : 0);
  const matching = Array.from({ length: 128 }, (_, index) => index === 0 ? 1 : 0);
  const weak = Array.from({ length: 128 }, (_, index) => index === 0 ? 0.8 : index === 1 ? 0.6 : 0);
  const mismatch = Array.from({ length: 128 }, (_, index) => index === 0 ? -1 : 0);
  const pendingThreshold = analyseSFaceShadowIdentity({ referenceEmbedding: reference, usableCaptureEmbeddings: [matching, weak, mismatch], threshold: null });
  assert.equal(pendingThreshold.conclusion, "UNABLE_TO_DETERMINE");
  assert.equal(pendingThreshold.reasonCode, "THRESHOLD_NOT_CONFIGURED");
  assert.equal(pendingThreshold.similarity, 0.8);
  assert.equal(analyseSFaceShadowIdentity({ referenceEmbedding: reference, usableCaptureEmbeddings: [matching, weak, mismatch], threshold: 0.75 }).conclusion, "LIKELY_MATCH");
  assert.equal(analyseSFaceShadowIdentity({ referenceEmbedding: reference, usableCaptureEmbeddings: [matching, weak], threshold: 0.75 }).reasonCode, "INSUFFICIENT_USABLE_CAPTURES");
});
