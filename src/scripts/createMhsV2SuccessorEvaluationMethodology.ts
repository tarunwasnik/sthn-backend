import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorEvaluationMethodology,
  defaultMhsV2SuccessorEvaluationMethodologyPaths,
  publishMhsV2SuccessorEvaluationMethodology,
} from "../research/textModerationDataset/mhsV2SuccessorEvaluationMethodology";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd();
const paths = defaultMhsV2SuccessorEvaluationMethodologyPaths(root);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(
  watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]),
);

const before = snapshot();
const artifact = createMhsV2SuccessorEvaluationMethodology(paths);
const replay = createMhsV2SuccessorEvaluationMethodology(paths);
if (canonicalJson(artifact) !== canonicalJson(replay)) throw new Error("T6L-8F-A deterministic replay mismatch");

const outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation");
const output = publishMhsV2SuccessorEvaluationMethodology(artifact, outputDirectory);
let overwriteRefusal = false;
try {
  publishMhsV2SuccessorEvaluationMethodology(artifact, outputDirectory);
} catch (error) {
  if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true;
  else throw error;
}
if (!overwriteRefusal) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8F-A overwrite refusal failed");
}

const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8F-A upstream evidence changed");
}

process.stdout.write(canonicalJson({
  status: artifact.status,
  artifactPath: output,
  artifactSha256: sha256FileStreaming(output),
  methodologyPayloadDigest: artifact.methodologyPayloadDigest,
  classification: artifact.classification.name,
  authorizedEvaluationCycles: artifact.reuseControl.exactAdditionalAuthorizedSuccessorEvaluationCycles,
  overwriteRefusal,
  upstreamUnchanged: true,
  boundaries: artifact.boundaries,
  nextPhase: artifact.executionPlan.exactNextPhase,
}));
