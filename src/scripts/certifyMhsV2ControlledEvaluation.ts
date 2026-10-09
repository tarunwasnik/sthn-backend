import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2ControlledEvaluationCertification,
  defaultControlledEvaluationCertificationPaths,
  publishMhsV2ControlledEvaluationCertification,
  sha256FileStreaming,
} from "../research/textModerationDataset/mhsV2ControlledEvaluationCertification";

const root = process.cwd(), paths = defaultControlledEvaluationCertificationPaths(root), outputDirectory = path.dirname(paths.contract);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), artifact = createMhsV2ControlledEvaluationCertification(paths), output = publishMhsV2ControlledEvaluationCertification(artifact, outputDirectory), after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8D-D upstream evidence changed during publication"); }
let overwriteRefusal = false;
try { publishMhsV2ControlledEvaluationCertification(artifact, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) throw new Error("T6L-8D-D overwrite refusal verification failed");
const sourceResults = artifact.sourceResults as Record<string, unknown>;
console.log(JSON.stringify({ status: artifact.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), certificationPayloadDigest: artifact.certificationPayloadDigest, sourceResults, privacy: artifact.privacy, boundaries: artifact.boundaries, overwriteRefusal, upstreamHashesBefore: before, upstreamHashesAfter: after, nextAction: "STOP_AFTER_T6L_8D_D_AWAIT_SEPARATE_ROADMAP_DECISION_AUTHORIZATION" }, null, 2));
