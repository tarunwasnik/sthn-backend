import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { decodeToVerifiedRgb, squareVerifiedRgb, tensorFromVerifiedRgb } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";
import { analyzeNudeNetOutput, compareStageADetections, rawOutputRelativeDelta } from "../evaluation/imageModeration/nudeNet320nStageAComparison";
import { NUDENET_320N } from "../evaluation/imageModeration/specialistRuntimeFeasibility";
import { G8C_R6_OPENCV_SHA256, G8C_R6_PACKAGE, G8C_R6_PACKAGE_VERSION } from "../evaluation/imageModeration/opencvWasmR6Contract";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r7-nudenet-node-canonical-parity");
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "specialists", "nudenet-320n", "320n.onnx");
const sourcePath = path.join(root, "src", "scripts", "runG8CR7NudeNetNodeCanonicalParity.ts");
const preprocessingPath = path.join(root, "src", "evaluation", "imageModeration", "nudeNet320nCorrectedPreprocess.ts");
const npmIntegrity = "sha512-PIm+eB0MFtieXoNC2GRao0dv/02sehG+Nv2nSW5D6pQm6J/4WqvDHm0RyoqOmGYQm67jdGiaOdIeTShCY3PIUg==";

const loadCv = async (): Promise<any> => {
  const loaded = require(G8C_R6_PACKAGE);
  const host = globalThis as typeof globalThis & { cv?: any };
  if (loaded?.Mat) return loaded;
  if (loaded instanceof Promise) return loaded;
  if (host.cv?.Mat) return host.cv;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OpenCV.js initialization timeout")), 30_000);
    loaded.onRuntimeInitialized = () => { clearTimeout(timer); resolve(); };
  });
  return host.cv ?? loaded;
};
const writeOnce = (name: string, value: unknown): Promise<void> => writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

void (async () => {
  const paths = {
    g8bPreregistration: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json",
    python: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json",
    r5: "evaluation-output/image-moderation/i4-g8c-r5-opencv-wasm-evaluation/g8c-r5-opencv-wasm-evaluation.json",
    r6: "evaluation-output/image-moderation/i4-g8c-r6-opencv-wasm-real-resize-parity/g8c-r6-opencv-wasm-real-resize-parity.json",
    r6Preregistration: "evaluation-output/image-moderation/i4-g8c-r6-opencv-wasm-real-resize-parity/g8c-r6-preregistration.json",
    inventory: "evaluation-cache/image-moderation/benchmark/inventory-manifest.json",
  } as const;
  const read = (relative: string) => readFile(path.join(root, relative));
  const [g8bBytes, pythonBytes, r5Bytes, r6Bytes, r6PreregistrationBytes, inventoryBytes, modelBytes, opencvBytes, packageBytes, sourceBytes, preprocessingBytes] = await Promise.all([
    ...Object.values(paths).map(read), readFile(modelPath), readFile(path.join(root, "node_modules", "@techstark", "opencv-js", "dist", "opencv.js")), readFile(path.join(root, "node_modules", "@techstark", "opencv-js", "package.json")), readFile(sourcePath), readFile(preprocessingPath),
  ]);
  if (hash(g8bBytes) !== "b7002420157e3b9f05d6e82d8703bccef05bd34ac6d2ec241e6937413c9a5623") throw new Error("Frozen G8-B selection authority mismatch");
  if (hash(pythonBytes) !== "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db") throw new Error("Frozen canonical Python authority mismatch");
  if (hash(r5Bytes) !== "a76779e4ee85d9c8ba91cb90110dd3ffba0a0c0771d84c42aa064f738b1c1f41") throw new Error("Frozen R5 authority mismatch");
  if (hash(r6PreregistrationBytes) !== "91a299d2e4f172a602b878ebe82d283f685940e5a2af2c796d9910e0465ac183" || hash(r6Bytes) !== "3cabb140d1dcf26f98fc44a58cb8461cbdda5c833b4c521f1c1fdb2dc1358e8b") throw new Error("Frozen R6 authority mismatch");
  if (hash(modelBytes) !== NUDENET_320N.modelSha256) throw new Error("Frozen NudeNet model SHA mismatch");
  if (hash(opencvBytes) !== G8C_R6_OPENCV_SHA256 || opencvBytes.length !== 13_298_869) throw new Error("Frozen OpenCV.js artifact mismatch");
  const packageRecord = JSON.parse(packageBytes.toString("utf8"));
  if (packageRecord.version !== G8C_R6_PACKAGE_VERSION || packageRecord.license !== "Apache-2.0") throw new Error("Frozen OpenCV.js package identity mismatch");
  const g8b = JSON.parse(g8bBytes.toString("utf8"));
  const python = JSON.parse(pythonBytes.toString("utf8"));
  const r6 = JSON.parse(r6Bytes.toString("utf8"));
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  const ids: string[] = g8b.selection.selected.map((row: { candidateId: string }) => row.candidateId);
  if (g8b.preregistrationFingerprint !== "e7c26c7d791c442e0d4b27eace92f5d1135907754813a2dc03adc06bc3c513e3" || ids.length !== 16 || new Set(ids).size !== 16) throw new Error("Frozen 16 identity mismatch");
  if (r6.status !== "OPENCV_WASM_REAL_RESIZE_PARITY_CONFIRMED" || r6.reportFingerprint !== "f1e607d21c51705a50f50c6a8df906e15f557ed45cf7a3d40bd7851dde50b6be") throw new Error("R6 was not confirmed");
  const pythonById = new Map<string, any>(python.rows.map((row: any) => [row.candidateId, row]));
  const candidatesById = new Map<string, any>(inventory.candidates.map((candidate: any) => [candidate.id, candidate]));
  if (python.rows.length !== 16 || !ids.every((id) => pythonById.has(id))) throw new Error("Python candidate authority mismatch");
  const selected = ids.map((id) => {
    const candidate = candidatesById.get(id); const reference = pythonById.get(id);
    if (!candidate?.localAsset || candidate.sha256 !== reference.candidateSha256) throw new Error(`Frozen candidate authority mismatch: ${id}`);
    return candidate;
  });
  const ortVersion = JSON.parse((await readFile(path.join(root, "node_modules", "onnxruntime-node", "package.json"))).toString("utf8")).version;
  await mkdir(output, { recursive: true });
  const preregistrationPayload = {
    schemaVersion: "STHN_I4_G8C_R7_NUDENET_NODE_CANONICAL_PARITY_PREREGISTRATION_V1", candidateIds: ids,
    authority: { g8bPreregistrationSha256: hash(g8bBytes), g8bPreregistrationFingerprint: g8b.preregistrationFingerprint, canonicalPythonSha256: hash(pythonBytes), canonicalPythonDetections: 58, canonicalPythonCandidatesWithDetections: 15, r5Sha256: hash(r5Bytes), r6Sha256: hash(r6Bytes), r6Fingerprint: r6.reportFingerprint, nudeNet320nModelSha256: hash(modelBytes) },
    runtime: { node: process.version, onnxruntimeNode: ortVersion, provider: "cpu", openCvJsPackage: G8C_R6_PACKAGE, openCvJsVersion: G8C_R6_PACKAGE_VERSION, openCvJsNpmIntegrity: npmIntegrity, openCvJsArtifactSha256: hash(opencvBytes) },
    sources: { runnerSha256: hash(sourceBytes), verifiedDecodeAndSquareSha256: hash(preprocessingBytes) },
    preprocessing: "Sharp verified RGB decode without explicit EXIF auto-rotation; explicit right/bottom zero-padded square; cv.matFromArray(CV_8UC3); cv.resize(INTER_LINEAR) to 320x320; destination.data RGB Uint8; Float32 /255 RGB NCHW [1,3,320,320]; explicit Mat deletion",
    graph: { input: "images float32 [1,3,320,320]", output: "output0 float32 [1,22,2100]" }, nativeClassOrder: NUDENET_320N.classes,
    detector: { confidence: "per-anchor maximum native class score; no objectness, sigmoid, or softmax", initialConfidenceAtLeast: 0.2, nmsScoreAtLeast: 0.25, nmsIouAtMost: 0.45 },
    comparison: { candidateSuccess: "required", retainedDetectionCount: "exact", nativeClass: "exact", confidenceAbsolute: 0.02, boxPixelsAbsolute: 3, rawOutputRelative: 0.02, rawOutputDigest: "recorded evidence only; not an additional criterion", acceptance: "All 16 candidate comparisons pass; totals must be 58 retained across 15 candidates." },
    runCount: { authorizedValidModelRuns: 1, noRerunOrTuningAfterOutputsVisible: true },
    prohibitions: { full558: false, policyMapping: false, humanLabelQualityMetrics: false, thresholdOrNmsChanges: false, otherModels: false, training: false, productionWiring: false },
  };
  const preregistration = { ...preregistrationPayload, preregistrationFingerprint: hash(JSON.stringify(preregistrationPayload)) };
  await writeOnce("g8c-r7-preregistration.json", preregistration);

  const cv = await loadCv();
  if (!cv?.Mat || !cv.resize || cv.CV_8UC3 !== 64 || cv.INTER_LINEAR !== 1) throw new Error("Frozen OpenCV.js resize contract unavailable");
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  if (session.inputNames.length !== 1 || session.inputNames[0] !== "images" || session.outputNames.length !== 1 || session.outputNames[0] !== "output0") throw new Error("Frozen NudeNet graph contract mismatch");
  const rows: any[] = [];
  try {
    for (const candidate of selected) {
      const bytes = await readFile(path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset));
      if (hash(bytes) !== candidate.sha256) throw new Error(`Source SHA mismatch: ${candidate.id}`);
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      if (!metadata.width || !metadata.height) throw new Error(`Source geometry unavailable: ${candidate.id}`);
      const decoded = await decodeToVerifiedRgb(bytes); const square = squareVerifiedRgb(decoded);
      const source = cv.matFromArray(square.height, square.width, cv.CV_8UC3, square.data); const destination = new cv.Mat(); let resized: Buffer;
      try { cv.resize(source, destination, new cv.Size(320, 320), 0, 0, cv.INTER_LINEAR); if (destination.cols !== 320 || destination.rows !== 320 || destination.channels() !== 3) throw new Error(`WASM resize geometry mismatch: ${candidate.id}`); resized = Buffer.from(destination.data); } finally { source.delete(); destination.delete(); }
      const input = tensorFromVerifiedRgb({ data: resized!, width: 320, height: 320, channels: 3 });
      const tensor = new ort.Tensor("float32", input.data, [...input.shape]); let result: ort.Tensor | undefined;
      try { result = (await session.run({ images: tensor })).output0 as ort.Tensor; const analysis = analyzeNudeNetOutput(result.data as Float32Array, metadata.width, metadata.height); rows.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, source: { width: metadata.width, height: metadata.height }, tensor: { shape: input.shape, count: input.data.length, finite: input.finiteCount, min: input.min, max: input.max, mean: input.mean, digest: input.digest }, ...analysis, matCleanup: true }); } finally { result?.dispose(); tensor.dispose(); }
    }
  } finally { await session.release(); }
  if (rows.length !== 16) throw new Error("R7 must account for exactly 16 candidates");
  const tolerances = preregistrationPayload.comparison;
  const comparisons = rows.map((row) => {
    const reference = pythonById.get(row.candidateId);
    const detections = compareStageADetections(reference.detections, row.detections, tolerances);
    const rawRelative = rawOutputRelativeDelta(reference.raw, row.raw);
    const tensorStatisticsPass = ["min", "max", "mean"].every((key) => Math.abs(row.tensor[key] - reference.tensor[key]) <= 0.02);
    const rawPass = row.raw.shape.join(",") === reference.raw.shape.join(",") && rawRelative <= tolerances.rawOutputRelative;
    const countPass = row.detections.length === reference.detections.length;
    return { candidateId: row.candidateId, successPass: true, retainedDetectionCount: { python: reference.detections.length, node: row.detections.length, pass: countPass }, tensorDigest: { python: reference.tensor.digest, node: row.tensor.digest, exact: reference.tensor.digest === row.tensor.digest }, rawOutput: { pythonDigest: reference.raw.digest, nodeDigest: row.raw.digest, exactDigest: reference.raw.digest === row.raw.digest, relativeStatisticsDelta: rawRelative, pass: rawPass }, tensorStatisticsPass, detections, passed: countPass && tensorStatisticsPass && rawPass && detections.passed };
  });
  const allPassed = comparisons.every((row) => row.passed);
  const total = rows.reduce((count, row) => count + row.detections.length, 0); const withDetections = rows.filter((row) => row.detections.length > 0).length;
  const status = allPassed && total === 58 && withDetections === 15 ? "NUDENET_NODE_CANONICAL_PARITY_CONFIRMED" : "NUDENET_NODE_CANONICAL_PARITY_NOT_CONFIRMED";
  const nodeResultsPayload = { schemaVersion: "STHN_I4_G8C_R7_NODE_RESULTS_V1", preregistrationFingerprint: preregistration.preregistrationFingerprint, processedCandidateIds: ids, retainedDetections: total, candidatesWithDetections: withDetections, rows, matCleanup: { allCandidates: rows.every((row) => row.matCleanup), strategy: "source and destination Mats deleted in finally for each candidate" } };
  const nodeResults = { ...nodeResultsPayload, reportFingerprint: hash(JSON.stringify(nodeResultsPayload)) };
  const stageComparisonPayload = { schemaVersion: "STHN_I4_G8C_R7_STAGE_COMPARISON_V1", preregistrationFingerprint: preregistration.preregistrationFingerprint, comparisons, allPassed, earliestSupportedDivergence: allPassed ? null : "PREPROCESSING_OR_RUNTIME_OUTPUT_AFTER_FROZEN_WASM_RESIZE" };
  const stageComparison = { ...stageComparisonPayload, reportFingerprint: hash(JSON.stringify(stageComparisonPayload)) };
  await writeOnce("g8c-r7-node-results.json", nodeResults); await writeOnce("g8c-r7-stage-comparison.json", stageComparison);
  const runtimeIdentity = { schemaVersion: "STHN_I4_G8C_R7_RUNTIME_IDENTITY_V1", modelSha256: hash(modelBytes), openCvJs: preregistrationPayload.runtime, runnerSha256: hash(sourceBytes), preprocessingSha256: hash(preprocessingBytes), nativeClassOrder: NUDENET_320N.classes, detector: preregistrationPayload.detector, matCleanup: nodeResults.matCleanup };
  await writeOnce("g8c-r7-runtime-identity.json", runtimeIdentity);
  const finalPayload = { schemaVersion: "STHN_I4_G8C_R7_NUDENET_NODE_CANONICAL_PARITY_V1", status, preregistrationFingerprint: preregistration.preregistrationFingerprint, authority: preregistrationPayload.authority, runtimeIdentity, canonicalPython: { sha256: hash(pythonBytes), retainedDetections: 58, candidatesWithDetections: 15 }, correctedNodeWasm: { retainedDetections: total, candidatesWithDetections: withDetections }, stageComparison, prohibitions: preregistrationPayload.prohibitions };
  const final = { ...finalPayload, reportFingerprint: hash(JSON.stringify(finalPayload)) };
  await writeOnce("g8c-r7-nudenet-node-canonical-parity.json", final); await writeFile(path.join(output, "g8c-r7-nudenet-node-canonical-parity.md"), `# I4-G8-C-R7\n\n${status}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status, preregistrationFingerprint: preregistration.preregistrationFingerprint, reportFingerprint: final.reportFingerprint, retainedDetections: total, candidatesWithDetections: withDetections }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
