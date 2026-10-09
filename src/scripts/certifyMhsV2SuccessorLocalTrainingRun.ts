import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorLocalTrainingCertification,
  defaultMhsV2SuccessorCertificationPaths,
  publishMhsV2SuccessorLocalTrainingCertification,
} from "../research/textModerationDataset/mhsV2SuccessorLocalTrainingCertification";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorCertificationPaths(root), watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), artifact = createMhsV2SuccessorLocalTrainingCertification(paths);
const output = publishMhsV2SuccessorLocalTrainingCertification(artifact, path.dirname(paths.contract));
let overwriteRefusal = false;
try { publishMhsV2SuccessorLocalTrainingCertification(artifact, path.dirname(paths.contract)); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-D overwrite refusal failed"); }
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-D watched upstream changed"); }
process.stdout.write(`${JSON.stringify({ status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), certificationPayloadDigest: artifact.certificationPayloadDigest, waiver: artifact.provenanceWaiver, run: artifact.run, checkpoints: artifact.checkpoints, limitations: artifact.limitations, isolation: artifact.isolation, certificationExecution: artifact.certificationExecution, overwriteRefusal, upstreamHashesBefore: before, upstreamHashesAfter: after, nextPhase: artifact.disposition.exactNextPhase }, null, 2)}\n`);
