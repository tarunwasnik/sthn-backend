import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFloat32RgbNchw, float32Bits, NUDE_NET_CANONICAL_FLOAT32_SCALE } from "../../evaluation/imageModeration/nudeNet320nCanonicalFloat32";
test("R9 uses a Float32 1/255 scale and deterministic RGB NCHW layout", () => { assert.equal(float32Bits(NUDE_NET_CANONICAL_FLOAT32_SCALE), "3b808081"); const rgb = new Uint8Array(320 * 320 * 3); rgb[0] = 255; rgb[1] = 128; rgb[2] = 1; const tensor = canonicalFloat32RgbNchw(rgb); assert.equal(tensor.length, 307200); assert.equal(tensor[0], 1); assert.equal(tensor[320 * 320], Math.fround(Math.fround(128) * NUDE_NET_CANONICAL_FLOAT32_SCALE)); assert.equal(tensor[2 * 320 * 320], Math.fround(Math.fround(1) * NUDE_NET_CANONICAL_FLOAT32_SCALE)); });
