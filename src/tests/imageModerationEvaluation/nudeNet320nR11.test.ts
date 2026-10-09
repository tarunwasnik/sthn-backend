import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalFloat32RgbNchw } from "../../evaluation/imageModeration/nudeNet320nCanonicalFloat32";
import { persistR11Raw, reloadR11Raw, verifyR11RawReload } from "../../evaluation/imageModeration/nudeNet320nR11Persistence";
import { G8C_R8_STAGE_A_IDS } from "../../evaluation/imageModeration/nudeNet320nR8Contract";
import { NUDENET_320N } from "../../evaluation/imageModeration/specialistRuntimeFeasibility";

test("R11 frozen16 is the exact unique R8 authority", () => {
  assert.equal(G8C_R8_STAGE_A_IDS.length, 16);
  assert.equal(new Set(G8C_R8_STAGE_A_IDS).size, 16);
});

test("R11 persistence preserves Float32 bytes, SHA and element count", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sthn-r11-test-")); const file = path.join(directory, "raw.f32");
  try { const values = new Float32Array([0, -0, 1, -1, Math.fround(1 / 3), Number.MIN_VALUE]); const persisted = await persistR11Raw(file, values); const reloaded = await reloadR11Raw(file); const verified = await verifyR11RawReload(file, values); assert.equal(persisted.sha256, reloaded.sha256); assert.equal(persisted.elementCount, values.length); assert.equal(verified.exact, true); assert.equal(verified.elementCount, values.length); } finally { await rm(directory, { recursive: true, force: true }); }
});

test("R11 runner freezes persisted-output-only mechanics and scope before inference", async () => {
  const runner = await readFile(path.join(process.cwd(), "src", "scripts", "runG8CR11PersistedRawParity.ts"), "utf8");
  assert.match(runner, /await writeOnce\("g8c-r11-preregistration\.json", preregistration\)/);
  assert.ok(runner.indexOf('g8c-r11-preregistration.json') < runner.indexOf("InferenceSession.create"));
  assert.match(runner, /postprocessPersistedR11Raw\(rawFile/);
  assert.match(runner, /authorizedValidModelRunsPerCandidate: 1/);
  assert.match(runner, /full558: false, unseen325: false/);
  assert.match(runner, /thresholdOrNmsChanges: false/);
});

test("R11 retains the native 18-class authority and canonical Float32 layout", () => {
  assert.equal(NUDENET_320N.classes.length, 18);
  const tensor = canonicalFloat32RgbNchw(new Uint8Array(320 * 320 * 3));
  assert.equal(tensor.length, 307200);
  assert.deepEqual(NUDENET_320N.classes.slice(0, 4), ["FEMALE_GENITALIA_COVERED", "FACE_FEMALE", "BUTTOCKS_EXPOSED", "FEMALE_BREAST_EXPOSED"]);
});
