import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2ControlledEvaluationContract,
  defaultMhsV2ControlledEvaluationContractPaths,
  publishMhsV2ControlledEvaluationContract,
  sha256EvaluationFile,
} from "../research/textModerationDataset/mhsV2ControlledEvaluationContract";

const root = process.cwd(), paths = defaultMhsV2ControlledEvaluationContractPaths(root);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256EvaluationFile(filename)]));
const before = snapshot(), artifact = createMhsV2ControlledEvaluationContract(paths);
const output = publishMhsV2ControlledEvaluationContract(artifact, path.dirname(paths.certification));
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8D-A source authority changed during publication");
}
console.log(JSON.stringify({
  status: artifact.status, artifactPath: output, artifactSha256: sha256EvaluationFile(output),
  contractPayloadDigest: artifact.contractPayloadDigest, candidate: artifact.candidate,
  stages: artifact.stages, outputContract: artifact.output, boundaries: artifact.boundaries,
  upstreamHashesBefore: before, upstreamHashesAfter: after,
  nextAction: artifact.lifecycle.exactNextAction,
}, null, 2));
