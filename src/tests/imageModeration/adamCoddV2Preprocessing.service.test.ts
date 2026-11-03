import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { AdamCoddV2PreprocessingError, AdamCoddV2PreprocessingService } from "../../services/imageModeration/adamCoddV2Preprocessing.service";
import { preprocessAdamCodd } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";

const service = new AdamCoddV2PreprocessingService();

test("V2 preprocessing emits the frozen float32 NCHW shape and RGB normalization", async () => {
  const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: { r: 0, g: 128, b: 255 } } }).png().toBuffer();
  const result = await service.preprocessOriginal(bytes);
  assert.deepEqual(result.shape, [1, 3, 384, 384]);
  assert.equal(result.data.constructor, Float32Array);
  assert.equal(result.data[0], -1);
  assert.equal(result.data[384 * 384], Math.fround(Math.fround(Math.fround(128 / 255) - Math.fround(0.5)) / Math.fround(0.5)));
  assert.equal(result.data[2 * 384 * 384], 1);
});

test("V2 preprocessing preserves the frozen direct-original orientation behavior", async () => {
  const original = await sharp({ create: { width: 7, height: 3, channels: 3, background: "#e61a1a" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const v2 = await service.preprocessOriginal(original);
  const direct = await preprocessAdamCodd(original);
  assert.equal(v2.digest, direct.digest);
});

test("V2 preprocessing rejects invalid bytes and existing resource-limit violations", async () => {
  await assert.rejects(() => service.preprocessOriginal(Buffer.from("not-an-image")), AdamCoddV2PreprocessingError);
  await assert.rejects(() => service.preprocessOriginal(Buffer.alloc(10 * 1024 * 1024 + 1)), AdamCoddV2PreprocessingError);
});
