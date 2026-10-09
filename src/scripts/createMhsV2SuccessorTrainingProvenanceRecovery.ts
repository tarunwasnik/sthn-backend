import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorProvenanceRecovery,
  defaultMhsV2SuccessorProvenancePaths,
  publishMhsV2SuccessorProvenanceRecovery,
  sha256FileStreaming,
} from "../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorProvenancePaths(root);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), artifact = createMhsV2SuccessorProvenanceRecovery(paths), replay = createMhsV2SuccessorProvenanceRecovery(paths);
if (canonicalJson(artifact) !== canonicalJson(replay)) throw new Error("T6L-8E-D0 deterministic replay mismatch");
const output = publishMhsV2SuccessorProvenanceRecovery(artifact, path.dirname(paths.preparation));
let overwriteRefusal = false;
try { publishMhsV2SuccessorProvenanceRecovery(artifact, path.dirname(paths.preparation)); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-D0 overwrite refusal failed"); }
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8E-D0 upstream evidence changed"); }
process.stdout.write(canonicalJson({ status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), recoveryPayloadDigest: artifact.recoveryPayloadDigest, certificationAdmissible: artifact.decision.certificationAdmissible, waiverIssued: artifact.waiver.issued, overwriteRefusal, upstreamUnchanged: true, boundaries: artifact.boundaries, nextAction: artifact.decision.exactNextAction }));
