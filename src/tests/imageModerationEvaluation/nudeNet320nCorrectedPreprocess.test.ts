import assert from "node:assert/strict";
import test from "node:test";
import {
  NUDE_NET_INPUT_ELEMENT_COUNT,
  NUDE_NET_INPUT_SIDE,
  squareVerifiedRgb,
  tensorFromVerifiedRgb,
} from "../../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";

const pixel = (data: Buffer, width: number, x: number, y: number): number[] =>
  [...data.subarray((y * width + x) * 3, (y * width + x + 1) * 3)];

test("square construction right/bottom pads landscape RGB without changing source pixels", () => {
  const square = squareVerifiedRgb({
    width: 3, height: 2, channels: 3,
    data: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
  });
  assert.equal(square.width, 3);
  assert.equal(square.height, 3);
  assert.equal(square.channels, 3);
  assert.equal(square.data.length, 27);
  assert.deepEqual(pixel(square.data, 3, 2, 1), [16, 17, 18]);
  assert.deepEqual(pixel(square.data, 3, 0, 2), [0, 0, 0]);
  assert.deepEqual(pixel(square.data, 3, 2, 2), [0, 0, 0]);
});

test("square construction right pads portrait RGB without changing source pixels", () => {
  const square = squareVerifiedRgb({
    width: 2, height: 3, channels: 3,
    data: Buffer.from([21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]),
  });
  assert.equal(square.width, 3);
  assert.equal(square.height, 3);
  assert.equal(square.data.length, 27);
  assert.deepEqual(pixel(square.data, 3, 1, 2), [36, 37, 38]);
  assert.deepEqual(pixel(square.data, 3, 2, 0), [0, 0, 0]);
  assert.deepEqual(pixel(square.data, 3, 2, 2), [0, 0, 0]);
});

test("square construction leaves an already square RGB image byte-identical", () => {
  const source = { width: 2, height: 2, channels: 3, data: Buffer.from([41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52]) };
  const square = squareVerifiedRgb(source);
  assert.equal(square.width, 2);
  assert.equal(square.height, 2);
  assert.deepEqual(square.data, source.data);
});

test("fixed-geometry RGB tensor has planar NCHW ordering with Float32 byte/255 tolerance", () => {
  const raw = Buffer.alloc(NUDE_NET_INPUT_ELEMENT_COUNT);
  raw.set([255, 0, 128, 0, 64, 255]);
  const tensor = tensorFromVerifiedRgb({ width: NUDE_NET_INPUT_SIDE, height: NUDE_NET_INPUT_SIDE, channels: 3, data: raw });
  const plane = NUDE_NET_INPUT_SIDE * NUDE_NET_INPUT_SIDE;
  assert.deepEqual(tensor.shape, [1, 3, 320, 320]);
  assert.equal(tensor.data.length, NUDE_NET_INPUT_ELEMENT_COUNT);
  assert.equal(tensor.data[0], 1);
  assert.equal(tensor.data[1], 0);
  assert.ok(Math.abs(tensor.data[plane] - 0) < 1e-7);
  assert.ok(Math.abs(tensor.data[plane + 1] - 64 / 255) < 1e-7);
  assert.ok(Math.abs(tensor.data[plane * 2] - 128 / 255) < 1e-7);
  assert.equal(tensor.data[plane * 2 + 1], 1);
  assert.equal(tensor.finiteCount, NUDE_NET_INPUT_ELEMENT_COUNT);
  assert.equal(tensor.min, 0);
  assert.equal(tensor.max, 1);
});

test("corrected raw contract rejects unsupported channels, malformed buffers, and non-320 tensor geometry", () => {
  assert.throws(() => squareVerifiedRgb({ width: 1, height: 1, channels: 4, data: Buffer.alloc(4) }));
  assert.throws(() => squareVerifiedRgb({ width: 2, height: 1, channels: 3, data: Buffer.alloc(5) }));
  assert.throws(() => tensorFromVerifiedRgb({ width: 2, height: 1, channels: 3, data: Buffer.alloc(6) }));
});
