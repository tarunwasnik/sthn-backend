import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
test("R5 binds the exact R4-selected OpenCV.js package and frozen R3 synthetic authority", async () => {
  const [r4, fixtures, packageJson] = await Promise.all([
    readFile(path.join(root, "evaluation-output/image-moderation/i4-g8c-r4-opencv-runtime-selection/g8c-r4-runtime-selection.json")),
    readFile(path.join(root, "evaluation-output/image-moderation/i4-g8c-r3-opencv-inter-linear-runtime/g8c-r3-synthetic-fixtures.json")),
    readFile(path.join(root, "node_modules/@techstark/opencv-js/package.json")),
  ]);
  assert.equal(sha256(r4), "aeee73d738c3d0b76e49b1e63179cf60db67aa697b1b8664e06aad504e416abd");
  assert.equal(sha256(fixtures), "12bedf7c86ecf40eae0f2823eafa916c35af1f0f73d2d6c4c92c48899e803ff6");
  const fixtureRecord = JSON.parse(fixtures.toString("utf8")); const packageRecord = JSON.parse(packageJson.toString("utf8"));
  assert.equal(fixtureRecord.fixtureFingerprint, "b0da1552afb1006b02ac8264890e17bcd0ce90d5921d8cd088a44f7e6b32f818");
  assert.equal(fixtureRecord.fixtures.length, 5);
  assert.equal(packageRecord.version, "5.0.0-release.1");
  assert.equal(packageRecord.license, "Apache-2.0");
});
