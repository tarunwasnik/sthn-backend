import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2FirstLocalTrainingCertification,
  defaultMhsV2FirstLocalCertificationPaths,
  publishMhsV2FirstLocalTrainingCertification,
  sha256FileStreaming,
} from "../research/textModerationDataset/mhsV2FirstLocalTrainingCertification";

const root = process.cwd(), paths = defaultMhsV2FirstLocalCertificationPaths(root);
const watched = [paths.release, paths.eligibility, paths.finalAssignmentCertification, paths.historicalSplit, paths.internalTestFreeze,
  paths.developmentProjection, paths.projectionManifest, paths.materializationManifest, paths.trainingReady, paths.train, paths.validation,
  paths.preparation, paths.environment, paths.contract, paths.runner, paths.runManifest, paths.resultSummary, paths.lifecycle];
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));

const before = snapshot(), artifact = createMhsV2FirstLocalTrainingCertification(paths);
const output = publishMhsV2FirstLocalTrainingCertification(artifact, path.dirname(paths.contract));
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8C3 source authority changed during certification publication");
}
console.log(JSON.stringify({
  status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), certificationPayloadDigest: artifact.certificationPayloadDigest,
  runManifestSha256: artifact.run.runManifestSha256, resultSummarySha256: artifact.run.resultSummarySha256,
  selectedCheckpoint: artifact.checkpoints.selectedPath, selectedModelSha256: artifact.checkpoints.finalModelSha256,
  retainedCheckpoints: artifact.checkpoints.retained, execution: artifact.execution, isolation: artifact.isolation,
  validationCaveat: artifact.validationCaveat, upstreamHashesBefore: before, upstreamHashesAfter: after,
  nextAction: artifact.disposition.exactNextAction,
}, null, 2));
