import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorReusedEvaluationContract,
  defaultMhsV2SuccessorReusedEvaluationContractPaths,
  publishMhsV2SuccessorReusedEvaluationContract,
} from "../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationContract";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorReusedEvaluationContractPaths(root), watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), artifact = createMhsV2SuccessorReusedEvaluationContract(paths), replay = createMhsV2SuccessorReusedEvaluationContract(paths);
if (canonicalJson(artifact) !== canonicalJson(replay)) throw new Error("T6L-8F-B deterministic replay mismatch");
const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation"), output = publishMhsV2SuccessorReusedEvaluationContract(artifact, outputDirectory);
let overwriteRefusal = false;
try { publishMhsV2SuccessorReusedEvaluationContract(artifact, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) { fs.rmSync(output, { force: true }); throw new Error("T6L-8F-B overwrite refusal failed"); }
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8F-B upstream evidence changed"); }
process.stdout.write(canonicalJson({ status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), contractPayloadDigest: artifact.contractPayloadDigest, evaluationCycleId: artifact.evaluationCycle.id, outputRoot: artifact.evaluationCycle.outputRoot, overwriteRefusal, upstreamUnchanged: true, boundaries: artifact.boundaries, nextPhase: artifact.executionPlan.nextPhase }));
