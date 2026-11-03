import assert from "node:assert/strict";
import test from "node:test";

import { readLocalMobileDevelopmentConfig } from "../../config/localMobileDevelopment";

test("local mobile development settings are disabled by default", () => {
  assert.deepEqual(readLocalMobileDevelopmentConfig({}), {});
});

test("accepts only loopback backend binding and one private HTTPS LAN origin", () => {
  assert.deepEqual(readLocalMobileDevelopmentConfig({
    STHN_BIND_HOST: "127.0.0.1",
    STHN_LOCAL_DEV_ORIGIN: "https://192.168.1.44:8443",
  }), {
    bindHost: "127.0.0.1",
    allowedOrigin: "https://192.168.1.44:8443",
  });
});

test("rejects non-loopback binding and malformed, public, or multi-origin values", () => {
  assert.throws(() => readLocalMobileDevelopmentConfig({ STHN_BIND_HOST: "0.0.0.0" }), /STHN_BIND_HOST/);
  for (const origin of [
    "http://192.168.1.44:8443",
    "https://8.8.8.8:8443",
    "https://192.168.1.44:5173",
    "https://192.168.1.44:8443/path",
    "https://192.168.1.44:8443,https://192.168.1.45:8443",
  ]) {
    assert.throws(() => readLocalMobileDevelopmentConfig({ STHN_LOCAL_DEV_ORIGIN: origin }), /STHN_LOCAL_DEV_ORIGIN/);
  }
});
