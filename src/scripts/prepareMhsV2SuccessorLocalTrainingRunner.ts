import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorLocalPreparation,
  defaultMhsV2SuccessorLocalPreparationPaths,
  publishMhsV2SuccessorLocalPreparation,
} from "../research/textModerationDataset/mhsV2SuccessorLocalTrainingPreparation";

const root = process.cwd(), paths = defaultMhsV2SuccessorLocalPreparationPaths(root);
const revision = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089";
const python = path.resolve(root, `evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/${revision}/.venv/Scripts/python.exe`);
const pythonTests = path.resolve(root, "src/tests/textModerationDataset/test_mhs_v2_successor_local_training_preparation.py");
const run = (args: readonly string[], marker?: string): void => {
  const result = spawnSync(python, args, { cwd: root, encoding: "utf8", timeout: 180_000 });
  if (result.status !== 0) throw new Error(`T6L-8E-C Python verification failed: ${result.stderr.slice(-1_000)}`);
  if (marker && !result.stdout.includes(marker)) throw new Error(`T6L-8E-C verification marker missing: ${marker}`);
};
const watched = Object.entries(paths).filter(([key]) => key !== "outputRoot").map(([, filename]) => filename);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256(fs.readFileSync(filename))]));
const before = snapshot();
run(["-m", "py_compile", paths.runner, paths.model]);
run([paths.runner, "--self-test"], "SELF_TEST_PASSED");
run([paths.runner, "--preflight"], "AUTHORITY_PREFLIGHT_PASSED");
run(["-m", "unittest", pythonTests, "-q"]);
const artifact = createMhsV2SuccessorLocalPreparation(paths, { preflightPassed: true, selfTestPassed: true, pythonTestsPassed: true });
const output = publishMhsV2SuccessorLocalPreparation(artifact, path.dirname(paths.contract));
let overwriteRefusal = false;
try { publishMhsV2SuccessorLocalPreparation(artifact, path.dirname(paths.contract)); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-C second publication was not refused"); }
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-C watched upstream authority changed"); }
process.stdout.write(canonicalJson({ status: artifact.status, artifactPath: output, artifactSha256: sha256(fs.readFileSync(output)), preparationPayloadDigest: artifact.preparationPayloadDigest, runnerSha256: artifact.implementation.runner && (artifact.implementation.runner as Record<string, unknown>).sha256, modelSha256: artifact.implementation.model && (artifact.implementation.model as Record<string, unknown>).sha256, deterministicReplay: true, overwriteRefusal, upstreamUnchanged: true, boundaries: artifact.boundaries, nextAction: "USER_MANUALLY_RUNS_NPM_RUN_TRAIN_TEXT_MODERATION_MHS_V2_SUCCESSOR_LOCAL" }));
