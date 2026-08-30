import assert from "node:assert/strict";
import test from "node:test";

import { ProfileVerificationYuNetRuntimeAudit } from "../../models/profileVerificationYuNetRuntimeAudit.model";
import { createYuNetRunnerAudit, withYuNetRunnerAuditContext } from "../../services/profile/profileVerificationYuNetRuntimeAudit.service";

const pathKey = "STHN_YUNET_MODEL_PATH";
const originalCreate = ProfileVerificationYuNetRuntimeAudit.create;
const originalValue = process.env[pathKey];
const originalOwn = Object.prototype.hasOwnProperty.call(process.env, pathKey);

const withEnv = async (value: string | undefined, action: () => Promise<void>) => {
  if (value === undefined) delete process.env[pathKey]; else process.env[pathKey] = value;
  try { await action(); }
  finally { if (originalOwn) process.env[pathKey] = originalValue!; else delete process.env[pathKey]; }
};

const captureAudit = async (value: string | undefined) => {
  const records: Array<Record<string, unknown>> = [];
  (ProfileVerificationYuNetRuntimeAudit as unknown as { create: (record: Record<string, unknown>) => Promise<Record<string, unknown>> }).create = async (record) => { records.push(record); return { _id: "audit" }; };
  try { await withEnv(value, async () => { await createYuNetRunnerAudit({ role: "SYNTHETIC", outcome: value ? "PATH_RESOLVED" : "ENV_ABSENT", value: process.env[pathKey] }); }); }
  finally { (ProfileVerificationYuNetRuntimeAudit as unknown as { create: typeof originalCreate }).create = originalCreate; }
  return records[0];
};

test("YuNet runtime audit distinguishes present, absent, empty, and whitespace environment states", async () => {
  const present = await captureAudit("models/face_detection_yunet_2026may.onnx");
  assert.equal(present.envHasOwnProperty, true); assert.equal(present.envValueType, "string"); assert.equal(present.envValuePresent, true); assert.ok(Number(present.envValueLength) > 0); assert.ok(Number(present.envValueTrimmedLength) > 0);
  const absent = await captureAudit(undefined);
  assert.equal(absent.envHasOwnProperty, false); assert.equal(absent.envValueType, "undefined"); assert.equal(absent.envValueLength, 0); assert.equal(absent.outcome, "ENV_ABSENT");
  const empty = await captureAudit("");
  assert.equal(empty.envHasOwnProperty, true); assert.equal(empty.envValueType, "string"); assert.equal(empty.envValueLength, 0);
  const whitespace = await captureAudit("  ");
  assert.equal(whitespace.envValueLength, 2); assert.equal(whitespace.envValueTrimmedLength, 0);
});

test("YuNet runtime audit carries bounded async job correlation without biometric fields", async () => {
  const records: Array<Record<string, unknown>> = [];
  (ProfileVerificationYuNetRuntimeAudit as unknown as { create: (record: Record<string, unknown>) => Promise<Record<string, unknown>> }).create = async (record) => { records.push(record); return { _id: "audit" }; };
  try {
    await withEnv("models/face_detection_yunet_2026may.onnx", async () => withYuNetRunnerAuditContext({ verificationReference: "PROFILE_VERIFICATION_TEST", jobReference: "PROFILE_VERIFICATION_JOB_TEST", submissionVersion: 7, attemptCount: 1 }, async () => {
      await createYuNetRunnerAudit({ role: "CAPTURE_0", outcome: "SESSION_LOAD_SUCCEEDED", value: process.env[pathKey], resolvedPath: "D:\\StHn\\backend\\models\\face_detection_yunet_2026may.onnx", resolvedPathExists: true });
    }));
  } finally { (ProfileVerificationYuNetRuntimeAudit as unknown as { create: typeof originalCreate }).create = originalCreate; if (originalOwn) process.env[pathKey] = originalValue!; else delete process.env[pathKey]; }
  const record = records[0];
  assert.deepEqual({ verificationReference: record.verificationReference, jobReference: record.jobReference, submissionVersion: record.submissionVersion, attemptCount: record.attemptCount, role: record.role }, { verificationReference: "PROFILE_VERIFICATION_TEST", jobReference: "PROFILE_VERIFICATION_JOB_TEST", submissionVersion: 7, attemptCount: 1, role: "CAPTURE_0" });
  for (const forbidden of ["bytes", "embedding", "landmarks", "providerUrl", "imageUrl"]) assert.equal(forbidden in record, false);
});
