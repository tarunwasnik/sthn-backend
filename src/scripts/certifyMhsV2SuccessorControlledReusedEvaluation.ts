import fs from "node:fs";
import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import {
  createMhsV2SuccessorControlledReusedEvaluationCertification,
  defaultSuccessorEvaluationCertificationPaths,
  publishMhsV2SuccessorControlledReusedEvaluationCertification,
  sha256FileStreaming,
} from "../research/textModerationDataset/mhsV2SuccessorControlledReusedEvaluationCertification";

const root = process.cwd(), paths = defaultSuccessorEvaluationCertificationPaths(root), outputDirectory = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/evaluation");
const watched = Object.values(paths), snapshot = (): Readonly<Record<string, string>> => Object.fromEntries(watched.map((filename) => [path.relative(root, filename).replace(/\\/gu, "/"), sha256FileStreaming(filename)]));
const before = snapshot(), first = createMhsV2SuccessorControlledReusedEvaluationCertification(paths), replay = createMhsV2SuccessorControlledReusedEvaluationCertification(paths);
if (canonicalJson(first) !== canonicalJson(replay)) throw new Error("T6L-8F-D deterministic replay mismatch");
const output = publishMhsV2SuccessorControlledReusedEvaluationCertification(first, outputDirectory), after = snapshot();
if (canonicalJson(before) !== canonicalJson(after)) { fs.rmSync(output, { force: true }); throw new Error("T6L-8F-D upstream evidence changed"); }
let overwriteRefusal = false;
try { publishMhsV2SuccessorControlledReusedEvaluationCertification(first, outputDirectory); }
catch (error) { if (error instanceof Error && /overwrite refused/u.test(error.message)) overwriteRefusal = true; else throw error; }
if (!overwriteRefusal) throw new Error("T6L-8F-D overwrite refusal not proven");
process.stdout.write(canonicalJson({ status: first.status, artifactPath: output, artifactSha256: sha256FileStreaming(output), certificationPayloadDigest: first.certificationPayloadDigest, run: first.run, reconciliation: first.reconciliation, comparison: first.certifiedComparison, interpretation: first.interpretation, boundaries: first.boundaries, deterministicReplayMatched: true, overwriteRefusal, upstreamUnchanged: true }));
