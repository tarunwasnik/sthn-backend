import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2PostEvaluationDiagnostic,
  defaultMhsV2PostEvaluationDiagnosticPaths,
  publishMhsV2PostEvaluationDiagnostic,
} from "../research/textModerationDataset/mhsV2PostEvaluationDiagnostic";
import { sha256FileStreaming } from "../research/textModerationDataset/mhsV2ControlledEvaluationCertification";

const root = process.cwd();
const paths = defaultMhsV2PostEvaluationDiagnosticPaths(root);
const outputDirectory = path.dirname(paths.certification);
const watched = Object.values(paths);
const snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));

const before = snapshot();
const artifact = createMhsV2PostEvaluationDiagnostic(paths);
const output = publishMhsV2PostEvaluationDiagnostic(artifact, outputDirectory);
const after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) {
  fs.rmSync(output, { force: true });
  throw new Error("T6L-8E-A upstream authority changed during publication");
}

let overwriteRefusal = false;
try { publishMhsV2PostEvaluationDiagnostic(artifact, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) throw new Error("T6L-8E-A overwrite refusal verification failed");

console.log(JSON.stringify({
  status: artifact.status,
  artifactPath: output,
  artifactSha256: sha256FileStreaming(output),
  diagnosticPayloadDigest: artifact.diagnosticPayloadDigest,
  falsePositiveCount: artifact.errorDiagnostics.falsePositives.count,
  falseNegativeCount: artifact.errorDiagnostics.falseNegatives.count,
  futurePathDecisionMatrix: artifact.futurePathDecisionMatrix,
  boundaries: artifact.boundaries,
  overwriteRefusal,
  upstreamHashesBefore: before,
  upstreamHashesAfter: after,
  nextAction: "STOP_AFTER_T6L_8E_A_AWAIT_SEPARATE_FUTURE_PATH_AUTHORIZATION",
}, null, 2));
