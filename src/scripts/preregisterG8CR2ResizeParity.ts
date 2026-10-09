import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { R2_DIAGNOSTIC_CANDIDATES, R2_SHARP_KERNELS } from "../evaluation/imageModeration/nudeNet320nResizeParity";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
void (async () => {
  const paths = { r1: "evaluation-output/image-moderation/i4-g8c-r1-preprocessing-stage-isolation/g8c-r1-preprocessing-stage-isolation.json", r1Comparison: "evaluation-output/image-moderation/i4-g8c-r1-preprocessing-stage-isolation/g8c-r1-stage-comparison.json", stageA: "evaluation-output/image-moderation/i4-g8c-corrected-nudenet-development-evaluation/g8c-corrected-node-parity.json", stageASource: "src/evaluation/imageModeration/nudeNet320nCorrectedPreprocess.ts" };
  const [r1, r1Comparison, stageA, stageASource] = await Promise.all(Object.values(paths).map((relative) => readFile(path.join(root, relative))));
  if (hash(r1) !== "bb4442052d79fb9e40f36f269a181b0adf92fe8ed90c8826fbb58357e1ab9a96" || hash(r1Comparison) !== "d3c903bd1698fe06c1d6432102e85ab62e7a73214175aab83bfdddbc9e23d5f1" || hash(stageA) !== "9a4d3d17fd8e8d8cb78ad64785568e242f3c708e150033001c6370ce29237be2" || hash(stageASource) !== "0a4a18d29c9d5a9b700d7ff2adf87d8edb0e84f2a12590edbaae4f50c7cdd981") throw new Error("Frozen R2 authority mismatch");
  const r1Report = JSON.parse(r1.toString("utf8"));
  if (r1Report.reportFingerprint !== "476be9e20a4753e246551be6638d661da56f0e2dd4706cb65bb6e94fc8011e7e" || r1Report.comparison.globalRootCause !== "RESIZE_IS_PRIMARY_REMAINING_DIVERGENCE") throw new Error("R1 authority does not authorize resize-only investigation");
  const payload = { schemaVersion: "STHN_I4_G8C_R2_RESIZE_PREREGISTRATION_V1", phase: "I4-G8-C-R2", authority: { r1Fingerprint: r1Report.reportFingerprint, r1Sha256: hash(r1), r1ComparisonSha256: hash(r1Comparison), failedStageASha256: hash(stageA), frozenStageAPreprocessingSha256: hash(stageASource) }, canonicalContract: { source: "NudeNet 3.4.2 cv2.dnn.blobFromImage", effectiveResize: "OpenCV cv::resize / INTER_LINEAR before RGB NCHW blob construction; no crop; 320x320", coordinateAndRoundingDetails: "OpenCV internal interpolation tables/rounding are implementation details not fully exposed by the Python API" }, diagnosticCandidates: R2_DIAGNOSTIC_CANDIDATES, sharpCandidates: R2_SHARP_KERNELS.map((kernel) => ({ kernel, configuration: "verified square RGB raw input; resize 320x320; fit fill; no crop, gamma, colour, or other transform" })), selectionRule: { metrics: ["aggregate RGB mean absolute byte difference ascending", "total differing bytes ascending", "declared kernel order"], passCriterion: "selected aggregate MAE <= 0.25; >=75% MAE reduction versus Sharp linear; every candidate MAE <=0.5", modelOutputUsed: false }, prohibitions: { modelInferenceDuringSelection: false, stageB: false, thresholdChanges: false, labelChanges: false, unrelatedCorpora: false, otherModels: false, production: false } };
  const report = { ...payload, preregistrationFingerprint: hash(JSON.stringify(payload)) };
  const out = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r2-canonical-resize-parity"); await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "g8c-r2-resize-preregistration.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ preregistrationFingerprint: report.preregistrationFingerprint, kernels: R2_SHARP_KERNELS }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
