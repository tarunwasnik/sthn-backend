/** AI-03 test-process guard. Import before application modules; never production code. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { mock } from "node:test";
import dotenv from "dotenv";

export const backendRoot = path.resolve(__dirname, "../../../..");
export const sfacePath = path.join(backendRoot, "models/face_recognition_sface_2021dec.onnx");
export const yunetPath = path.join(backendRoot, "models/face_detection_yunet_2026may.onnx");
const binary = path.join(backendRoot, "node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe");
assert.ok(fs.existsSync(binary), "Offline tests require the existing MongoDB binary; downloads are forbidden");
process.env.NODE_ENV = "test";
process.env.MONGOMS_RUNTIME_DOWNLOAD = "false";
process.env.MONGOMS_SYSTEM_BINARY = binary;
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/ai03_unused";
process.env.STHN_PROFILE_VERIFICATION_WORKER_ENABLED = "false";
process.env.STHN_PROFILE_VERIFICATION_STARTUP_DIAGNOSTIC_ENABLED = "false";
process.env.STHN_SFACE_MODEL_PATH = sfacePath;
delete process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
process.env.STHN_PROFILE_VERIFICATION_POLICY = "LEGACY_AVATAR_ONLY_V1";
// Prevent developer credentials/configuration from entering this test process.
mock.method(dotenv, "config", () => ({ parsed: {} }));
const prohibited = () => { throw new Error("AI03_EXTERNAL_NETWORK_FORBIDDEN"); };
mock.method(globalThis, "fetch", prohibited);
mock.method(http, "request", prohibited);
mock.method(http, "get", prohibited);
mock.method(https, "request", prohibited);
mock.method(https, "get", prohibited);
mock.method(tls, "connect", prohibited);
const connect = net.Socket.prototype.connect;
mock.method(net.Socket.prototype, "connect", function (this: net.Socket, ...args: unknown[]) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = values[0];
  const host = typeof options === "object" && options !== null
    ? (options as { host?: string }).host
    : typeof values[1] === "string" ? values[1] : "127.0.0.1";
  assert.ok(host === "127.0.0.1" || host === "::1" || host === "localhost", "Only disposable loopback MongoDB is allowed");
  return Reflect.apply(connect, this, args);
});
