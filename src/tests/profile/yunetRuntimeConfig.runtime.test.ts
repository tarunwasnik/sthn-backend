import assert from "node:assert/strict";
import { test } from "node:test";

test("YuNet runtime configuration is captured once and remains stable after raw environment mutation", () => {
  const modulePath = require.resolve("../../config/yunetRuntimeConfig");
  const original = process.env.STHN_YUNET_MODEL_PATH;
  try {
    process.env.STHN_YUNET_MODEL_PATH = "models/face_detection_yunet_2026may.onnx";
    delete require.cache[modulePath];
    const { YUNET_RUNTIME_CONFIG } = require("../../config/yunetRuntimeConfig") as typeof import("../../config/yunetRuntimeConfig");
    delete process.env.STHN_YUNET_MODEL_PATH;
    assert.equal(YUNET_RUNTIME_CONFIG.configuredPath, "models/face_detection_yunet_2026may.onnx");
    assert.match(YUNET_RUNTIME_CONFIG.resolvedPath ?? "", /models[\\/]face_detection_yunet_2026may\.onnx$/);
  } finally {
    if (original === undefined) delete process.env.STHN_YUNET_MODEL_PATH;
    else process.env.STHN_YUNET_MODEL_PATH = original;
    delete require.cache[modulePath];
  }
});

test("YuNet runtime configuration preserves a safely missing initial configuration", () => {
  const modulePath = require.resolve("../../config/yunetRuntimeConfig");
  const original = process.env.STHN_YUNET_MODEL_PATH;
  try {
    delete process.env.STHN_YUNET_MODEL_PATH;
    delete require.cache[modulePath];
    const { YUNET_RUNTIME_CONFIG } = require("../../config/yunetRuntimeConfig") as typeof import("../../config/yunetRuntimeConfig");
    assert.equal(YUNET_RUNTIME_CONFIG.configuredPath, undefined);
    assert.equal(YUNET_RUNTIME_CONFIG.resolvedPath, undefined);
  } finally {
    if (original === undefined) delete process.env.STHN_YUNET_MODEL_PATH;
    else process.env.STHN_YUNET_MODEL_PATH = original;
    delete require.cache[modulePath];
  }
});
