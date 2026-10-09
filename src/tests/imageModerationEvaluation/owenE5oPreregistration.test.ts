import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const artifact = path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs", "e5o-preregistration.json");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("E5O preregistration binds E4O and freezes one nonlinear-head experiment", async () => {
  const record = JSON.parse(await readFile(artifact, "utf8")) as Record<string, any>;
  const { preRegistrationSha256, ...payload } = record;
  assert.equal(preRegistrationSha256, digest(payload));
  assert.deepEqual([record.e4Baseline.runId, record.e4Baseline.bestHeadSha256, record.authorities.splitFingerprint], ["i4-e4o-first-binary-head-seed-104729", "f3881a4e1a854c2c8db467b32f50ca0764e60fed36bec0e673302789652bb60a", "de209dc412f3272c06eaecd2314d882f45c7c3fdfddb1e70a48e68f1bdaa98d2"]);
  assert.deepEqual(record.proposedModel.architecture, ["Linear(220,64)", "ReLU", "Dropout(0.20)", "Linear(64,2)"]);
  assert.deepEqual([record.proposedModel.trainableParameters, record.proposedModel.classMapping, record.proposedModel.backboneFrozen], [14274, { PASS: 0, BLOCK: 1 }, true]);
  assert.deepEqual([record.training.seed, record.training.learningRate, record.training.weightDecay, record.training.batchSize, record.training.maxEpochs, record.training.earlyStoppingPatience], [104729, .001, .0001, 32, 50, 8]);
  assert.deepEqual(record.prohibitions, { holdoutAccess: false, thresholdOptimization: false, backboneUnfreezing: false, hyperparameterSweep: false, multipleSeeds: false, dataMutation: false, trainingPerformed: false, checkpointCreated: false, productionMutation: false });
  assert.deepEqual([record.errorAnalysis.total, record.errorAnalysis.falsePositives.count, record.errorAnalysis.falseNegatives.count], [14, 8, 6]);
});
