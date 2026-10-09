import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorTrainingProvenanceWaiver,
  defaultMhsV2SuccessorWaiverPaths,
  publishMhsV2SuccessorTrainingProvenanceWaiver,
} from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceWaiver";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd();
const paths = defaultMhsV2SuccessorWaiverPaths(root);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(
  watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]),
);

const before = snapshot();
const artifact = createMhsV2SuccessorTrainingProvenanceWaiver(paths);
const replay = createMhsV2SuccessorTrainingProvenanceWaiver(paths);
if (canonicalJson(artifact) !== canonicalJson(replay)) throw new Error("T6L-8E-D0W deterministic replay mismatch");

const outputDirectory = path.dirname(paths.d0Analysis);
const output = publishMhsV2SuccessorTrainingProvenanceWaiver(artifact, outputDirectory);
let overwriteRefusal = false;
try {
  publishMhsV2SuccessorTrainingProvenanceWaiver(artifact, outputDirectory);
} catch (error) {
  if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true;
  else throw error;
}
if (!overwriteRefusal) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8E-D0W overwrite refusal failed");
}

const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8E-D0W upstream evidence changed");
}

process.stdout.write(canonicalJson({
  status: artifact.status,
  artifactPath: output,
  artifactSha256: sha256FileStreaming(output),
  waiverPayloadDigest: artifact.waiverPayloadDigest,
  certificationAdmissible: artifact.admissibility.certificationAdmissible,
  exactSourceProvenanceRecovered: artifact.admissibility.exactSourceProvenanceRecovered,
  overwriteRefusal,
  upstreamUnchanged: true,
  boundaries: artifact.boundaries,
  nextPhase: artifact.admissibility.nextPhase,
}));
