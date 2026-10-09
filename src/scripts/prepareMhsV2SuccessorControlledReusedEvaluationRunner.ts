import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorReusedEvaluationPreparation,
  defaultMhsV2SuccessorReusedEvaluationPreparationPaths,
  publishMhsV2SuccessorReusedEvaluationPreparation,
} from "../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationPreparation";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorReusedEvaluationPreparationPaths(root), revision = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089";
const python = path.resolve(root, `evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/${revision}/.venv/Scripts/python.exe`);
const run = (args: readonly string[], marker: string): void => { const result = spawnSync(python, args, { cwd: root, encoding: "utf8", timeout: 120_000 }); if (result.status !== 0) throw new Error(`T6L-8F-C ${args.join(" ")} failed: ${result.stderr.slice(-500)}`); if (!result.stdout.includes(marker)) throw new Error(`T6L-8F-C ${marker} missing`); };
const watched = Object.values(paths), snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot();
run(["-c", `from pathlib import Path; files=[r'${paths.runner.replace(/\\/gu, "\\\\")}',r'${paths.metricsHelper.replace(/\\/gu, "\\\\")}']; [compile(Path(f).read_text(encoding='utf-8'),f,'exec') for f in files]; print('SYNTAX_CHECK_PASSED')`], "SYNTAX_CHECK_PASSED");
run([paths.runner, "--self-test"], "SELF_TEST_PASSED");
const artifact = createMhsV2SuccessorReusedEvaluationPreparation(paths, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true });
const replay = createMhsV2SuccessorReusedEvaluationPreparation(paths, { syntaxCheckPassed: true, syntheticSelfTestPassed: true, protectedFreePreflightPassed: true });
if (canonicalJson(artifact) !== canonicalJson(replay)) throw new Error("T6L-8F-C deterministic replay mismatch");
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation"), output = publishMhsV2SuccessorReusedEvaluationPreparation(artifact, outputDirectory);
try { run([paths.runner, "--preflight"], "AUTHORITY_PREFLIGHT_PASSED"); }
catch (error) { fs.rmSync(output, { force: true }); throw error; }
let overwriteRefusal = false;
try { publishMhsV2SuccessorReusedEvaluationPreparation(artifact, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) { fs.rmSync(output, { force: true }); throw new Error("T6L-8F-C overwrite refusal failed"); }
const after = snapshot(); if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8F-C watched evidence changed"); }
process.stdout.write(canonicalJson({ status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), preparationPayloadDigest: artifact.preparationPayloadDigest, runner: artifact.implementation.runner, metricsHelper: artifact.implementation.metricsHelper, protectedBridge: artifact.implementation.protectedBridge, modelAdapter: artifact.implementation.modelAdapter, cycle: artifact.cycle, command: artifact.execution.localCommand, testEvidence: artifact.testEvidence, boundaries: artifact.boundaries, overwriteRefusal, upstreamUnchanged: true, nextPhase: artifact.execution.nextPhaseAfterUserRun }));
