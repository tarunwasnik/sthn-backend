import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import {
  createMhsV2ControlledEvaluationPreparation,
  defaultMhsV2ControlledEvaluationPreparationPaths,
  publishMhsV2ControlledEvaluationPreparation,
} from "../research/textModerationDataset/mhsV2ControlledEvaluationPreparation";

const root = process.cwd(), paths = defaultMhsV2ControlledEvaluationPreparationPaths(root), revision = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089";
const python = path.resolve(root, `evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/${revision}/.venv/Scripts/python.exe`);
const run = (mode: "--preflight" | "--self-test"): void => {
  const result = spawnSync(python, [paths.runner, mode], { cwd: root, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`T6L-8D-B ${mode} failed: ${result.stderr.slice(-500)}`);
  if (!result.stdout.includes(mode === "--preflight" ? "PREFLIGHT_PASSED" : "SELF_TEST_PASSED")) throw new Error(`T6L-8D-B ${mode} result missing`);
};
const watched = Object.values(paths), snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256(fs.readFileSync(filename))]));
const before = snapshot(); run("--self-test"); run("--preflight");
const artifact = createMhsV2ControlledEvaluationPreparation(paths, { preflightPassed: true, selfTestPassed: true });
const output = publishMhsV2ControlledEvaluationPreparation(artifact, path.dirname(paths.contract));
const after = snapshot(); if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8D-B upstream authority changed during publication"); }
console.log(JSON.stringify({ status: artifact.status, artifactPath: output, artifactSha256: sha256(fs.readFileSync(output)), preparationPayloadDigest: artifact.preparationPayloadDigest, runner: artifact.runner, configuration: artifact.configuration, resourcePolicy: artifact.resourcePolicy, boundaries: artifact.boundaries, upstreamHashesBefore: before, upstreamHashesAfter: after, nextAction: "USER_RUNS_NPM_RUN_EVALUATE_TEXT_MODERATION_MHS_V2_LOCAL" }, null, 2));
