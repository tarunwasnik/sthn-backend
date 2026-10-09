import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2ControlledEvaluationCertification";
import { createMhsV2SuccessorTrainingArtifacts, defaultMhsV2SuccessorPaths, publishMhsV2SuccessorTrainingArtifacts } from "../research/textModerationDataset/mhsV2SuccessorTrainingContract";

const root = process.cwd(), paths = defaultMhsV2SuccessorPaths(root), outputDirectory = path.dirname(paths.diagnostic);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(Object.values(paths).map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), artifacts = createMhsV2SuccessorTrainingArtifacts(paths), published = publishMhsV2SuccessorTrainingArtifacts(artifacts, outputDirectory), after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { published.forEach((filename) => fs.rmSync(filename, { force: true })); throw new Error("T6L-8E-B upstream authority changed during publication"); }
let overwriteRefusal = false;
try { publishMhsV2SuccessorTrainingArtifacts(artifacts, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) throw new Error("T6L-8E-B overwrite refusal verification failed");
console.log(JSON.stringify({ status: artifacts.contract.status, strategyArtifactPath: published[0], strategyArtifactSha256: sha256FileStreaming(published[0]), strategyPayloadDigest: artifacts.strategy.strategyPayloadDigest, contractArtifactPath: published[1], contractArtifactSha256: sha256FileStreaming(published[1]), contractPayloadDigest: artifacts.contract.contractPayloadDigest, selectedStrategy: artifacts.strategy.selectedStrategy, seed: artifacts.contract.reproducibility, overwriteRefusal, upstreamHashesBefore: before, upstreamHashesAfter: after, boundaries: artifacts.contract.boundaries, nextAction: "STOP_AFTER_T6L_8E_B_AWAIT_T6L_8E_C_AUTHORIZATION" }, null, 2));
