import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { ADAMCODD_RUNTIME_AUTHORITY, interpretAdamCoddLogits, preprocessAdamCodd, softmaxAdamCoddLogits, validateAdamCoddTensorContract } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";

test("AdamCodd authority fixes native ordering without an STHN field", () => {
  assert.deepEqual(ADAMCODD_RUNTIME_AUTHORITY.classIndexToNativeLabel, ["sfw", "nsfw"]);
  const result = interpretAdamCoddLogits([1, 2]);
  assert.deepEqual(result.nativeClass, "nsfw"); assert.equal("decision" in result, false); assert.equal("pass" in result, false);
});
test("AdamCodd output interpretation applies finite two-class softmax and argmax", () => {
  assert.deepEqual(softmaxAdamCoddLogits([0, Math.log(3)]).map(value => Number(value.toFixed(8))), [0.25, 0.75]);
  assert.throws(() => softmaxAdamCoddLogits([0, Number.NaN])); assert.throws(() => interpretAdamCoddLogits([0]));
});
test("AdamCodd ONNX metadata contract rejects unexpected tensors", () => {
  validateAdamCoddTensorContract({ name: "pixel_values", type: "float32", shape: ["batch_size", "num_channels", "height", "width"] }, { name: "logits", type: "float32", shape: ["batch_size", 2] });
  assert.throws(() => validateAdamCoddTensorContract({ name: "wrong", type: "float32", shape: [1, 3, 384, 384] }, { name: "logits", type: "float32", shape: ["batch_size", 2] }));
});
test("AdamCodd preprocessing is deterministic NCHW float32 with the frozen dimensions", async () => {
  const bytes = await sharp({ create: { width: 7, height: 5, channels: 3, background: { r: 16, g: 128, b: 240 } } }).png().toBuffer();
  const first = await preprocessAdamCodd(bytes); const second = await preprocessAdamCodd(bytes);
  assert.deepEqual(first.shape, [1, 3, 384, 384]); assert.equal(first.data.length, 3 * 384 * 384); assert.equal(first.digest, second.digest); assert.equal(first.data.constructor, Float32Array); assert.equal(first.min >= -1 && first.max <= 1, true);
});
