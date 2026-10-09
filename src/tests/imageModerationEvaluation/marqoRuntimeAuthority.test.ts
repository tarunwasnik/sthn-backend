import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MARQO_RUNTIME_AUTHORITY, interpretMarqoLogits, preprocessMarqo } from "../../evaluation/imageModeration/marqoRuntimeAuthority";

test("Marqo authority retains only native class semantics", () => {
  assert.deepEqual(MARQO_RUNTIME_AUTHORITY.classIndexToNativeLabel, ["NSFW", "SFW"]);
  assert.equal(MARQO_RUNTIME_AUTHORITY.inputName, "input");
  assert.equal(MARQO_RUNTIME_AUTHORITY.outputName, "logits");
  assert.deepEqual(MARQO_RUNTIME_AUTHORITY.inputShape, [1, 3, 384, 384]);
  assert.deepEqual(MARQO_RUNTIME_AUTHORITY.outputShape, [1, 2]);
  assert.equal(MARQO_RUNTIME_AUTHORITY.interpolation, "bicubic");
  assert.equal(MARQO_RUNTIME_AUTHORITY.cropMode, "center");
  assert.deepEqual(interpretMarqoLogits([1, 2]), { nativeClassIndex: 1, nativeClass: "SFW", logits: [1, 2] });
  assert.throws(() => interpretMarqoLogits([1]));
});

test("Marqo preprocessing is deterministic float32 NCHW", async () => {
  const bytes = await sharp({ create: { width: 11, height: 7, channels: 3, background: { r: 19, g: 137, b: 241 } } }).png().toBuffer();
  const first = await preprocessMarqo(bytes), second = await preprocessMarqo(bytes);
  assert.deepEqual(first.shape, [1, 3, 384, 384]); assert.equal(first.data.length, 3 * 384 * 384); assert.equal(first.digest, second.digest); assert.equal(first.data.constructor, Float32Array);
});
