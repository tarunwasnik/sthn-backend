import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g6-r1-nudenet-license-resolution", "g6-r1-nudenet-license-resolution.json");

test("G6-R1 pins only the exact official NudeNet 320n distribution and preserves G6", async () => {
  const report = JSON.parse(await readFile(output, "utf8"));
  assert.equal(report.frozenAuthoritySha256.g6, "94faa90e63e30a79625493f1e6f391ce170ac6ad92d6f86c003eeed41b4d0cca");
  assert.equal(report.priorG6.gantManDecisionUnchanged, "ELIGIBLE_FOR_CONTROLLED_ACQUISITION");
  assert.deepEqual(report.target, { canonicalProject: "https://github.com/notAI-tech/NudeNet", exactModel: "320n.onnx", excludes: ["640m", "GantMan/NSFWJS"] });
  assert.ok(["CLEARED_FOR_CONTROLLED_EVALUATION", "PERMANENT_LICENSING_HOLD"].includes(report.decision));
  assert.equal(report.decision, "CLEARED_FOR_CONTROLLED_EVALUATION");
  assert.equal(report.controlledEvaluationStatus, report.decision);
  assert.equal(report.productionDeploymentStatus, "LEGAL_DEPLOYMENT_REVIEW_REQUIRED");
});

test("G6-R1 requires the official package hash chain and separates code, package, and model licensing", async () => {
  const report = JSON.parse(await readFile(output, "utf8"));
  const cache = path.join(root, "evaluation-cache", "image-moderation", "g6-r1-nudenet-license-inspection");
  const wheel = await readFile(path.join(cache, report.pypi.wheel.filename));
  assert.equal(hash(wheel), report.pypi.wheel.sha256);
  assert.equal(report.pypi.wheel.localSha256, report.pypi.wheel.sha256);
  assert.equal(report.model.path, "nudenet/320n.onnx");
  assert.match(report.model.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.model.bundled, true);
  assert.equal(report.licenseEvidence.packageMetadata.declaredLicense, "MIT");
  assert.equal(report.licenseEvidence.bundledLicenseFiles.text, "GNU Affero General Public License v3.0");
  assert.equal(report.licenseEvidence.bundledLicenseFiles.modelExclusions, false);
  assert.equal(report.licenseEvidence.sdistBuildEvidence.deliberateInclusion, true);
  assert.match(report.licenseEvidence.reconciliation, /conflict/i);
});

test("G6-R1 report is deterministic and contains no runtime or production dependency", async () => {
  const raw = await readFile(output); const report = JSON.parse(raw.toString("utf8"));
  const { reportFingerprint, ...payload } = report;
  assert.equal(reportFingerprint, hash(JSON.stringify(payload)));
  assert.deepEqual(report.prohibitionsObserved, { packageInstalled: false, downloadedCodeExecuted: false, modelLoaded: false, inference: false, trainingOrTuning: false, productionMutation: false });
  const source = await readFile(path.join(root, "src", "scripts", "analyzeProfessionalImagePolicyV2NudeNetLicenseResolution.ts"), "utf8");
  assert.doesNotMatch(source, /^import.*(?:onnxruntime|sharp|tensorflow|child_process)/m);
  assert.doesNotMatch(source, /production\//i);
});
