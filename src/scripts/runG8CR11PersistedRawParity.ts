import { createHash } from "node:crypto";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { decodeToVerifiedRgb, squareVerifiedRgb } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";
import { canonicalFloat32RgbNchw, float32Digest } from "../evaluation/imageModeration/nudeNet320nCanonicalFloat32";
import { postprocessPersistedR11Raw } from "../evaluation/imageModeration/nudeNet320nR11Postprocess";
import { persistR11Raw, reloadR11Raw, r11Sha } from "../evaluation/imageModeration/nudeNet320nR11Persistence";
import { compareStageADetections, rawOutputRelativeDelta } from "../evaluation/imageModeration/nudeNet320nStageAComparison";
import { G8C_R8_STAGE_A_IDS } from "../evaluation/imageModeration/nudeNet320nR8Contract";
import { G8C_R6_OPENCV_SHA256, G8C_R6_PACKAGE, G8C_R6_PACKAGE_VERSION } from "../evaluation/imageModeration/opencvWasmR6Contract";
import { NUDENET_320N } from "../evaluation/imageModeration/specialistRuntimeFeasibility";

const hash = (value: Buffer | Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r11-persisted-raw-parity");
const rawDirectory = path.join(output, "raw-f32");
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "specialists", "nudenet-320n", "320n.onnx");
const source = (relative: string) => path.join(root, relative);
const writeOnce = (name: string, value: unknown) => writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;

const loadCv = async (): Promise<any> => {
  const loaded = require(G8C_R6_PACKAGE); const host = globalThis as typeof globalThis & { cv?: any };
  if (loaded?.Mat) return loaded; if (loaded instanceof Promise) return loaded; if (host.cv?.Mat) return host.cv;
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("OpenCV.js initialization timeout")), 30_000); loaded.onRuntimeInitialized = () => { clearTimeout(timer); resolve(); }; });
  return host.cv ?? loaded;
};

void (async () => {
  try { await access(output, constants.F_OK); throw new Error("R11 output already exists; one-shot execution refuses rerun"); } catch (error) { if (error instanceof Error && error.message.includes("one-shot")) throw error; }
  const files = {
    g8b: source("evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json"),
    python: source("evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json"),
    r9: source("evaluation-output/image-moderation/i4-g8c-r9-canonical-float32-tensor-parity/g8c-r9-canonical-float32-tensor-parity.json"),
    r7Runtime: source("evaluation-output/image-moderation/i4-g8c-r7-nudenet-node-canonical-parity/g8c-r7-runtime-identity.json"),
    inventory: source("evaluation-cache/image-moderation/benchmark/inventory-manifest.json"),
    opencv: source("node_modules/@techstark/opencv-js/dist/opencv.js"), package: source("node_modules/@techstark/opencv-js/package.json"),
    corrected: source("src/evaluation/imageModeration/nudeNet320nCorrectedPreprocess.ts"), helper: source("src/evaluation/imageModeration/nudeNet320nCanonicalFloat32.ts"),
    postprocessor: source("src/evaluation/imageModeration/nudeNet320nR11Postprocess.ts"), persistence: source("src/evaluation/imageModeration/nudeNet320nR11Persistence.ts"), runner: source("src/scripts/runG8CR11PersistedRawParity.ts"),
  };
  const [g8bBytes, pythonBytes, r9Bytes, r7RuntimeBytes, inventoryBytes, modelBytes, opencvBytes, packageBytes, correctedBytes, helperBytes, postprocessorBytes, persistenceBytes, runnerBytes, ortPackageBytes] = await Promise.all([
    readFile(files.g8b), readFile(files.python), readFile(files.r9), readFile(files.r7Runtime), readFile(files.inventory), readFile(modelPath), readFile(files.opencv), readFile(files.package), readFile(files.corrected), readFile(files.helper), readFile(files.postprocessor), readFile(files.persistence), readFile(files.runner), readFile(source("node_modules/onnxruntime-node/package.json")),
  ]);
  if (hash(g8bBytes) !== "b7002420157e3b9f05d6e82d8703bccef05bd34ac6d2ec241e6937413c9a5623" || hash(pythonBytes) !== "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db" || hash(r9Bytes) !== "47390337bab33e01d4a23d9e9b86e624c95123332df11e9e535204c7b858aa36") throw new Error("R11 frozen G8-B/R9 authority hash mismatch");
  if (hash(modelBytes) !== NUDENET_320N.modelSha256) throw new Error("R11 NudeNet model SHA mismatch");
  if (hash(opencvBytes) !== G8C_R6_OPENCV_SHA256 || JSON.parse(packageBytes.toString()).version !== G8C_R6_PACKAGE_VERSION) throw new Error("R11 OpenCV.js authority mismatch");
  const g8b = JSON.parse(g8bBytes.toString()); const python = JSON.parse(pythonBytes.toString()); const r9 = JSON.parse(r9Bytes.toString()); const r7Runtime = JSON.parse(r7RuntimeBytes.toString()); const inventory = JSON.parse(inventoryBytes.toString());
  const ids: string[] = g8b.selection.selected.map((row: { candidateId: string }) => row.candidateId);
  if (g8b.preregistrationFingerprint !== "e7c26c7d791c442e0d4b27eace92f5d1135907754813a2dc03adc06bc3c513e3" || canonical(ids) !== canonical(G8C_R8_STAGE_A_IDS) || new Set(ids).size !== 16) throw new Error("R11 exact frozen16 identity mismatch");
  if (r9.result !== "CANONICAL_FLOAT32_TENSOR_PARITY_CONFIRMED" || r9.parity?.exactTensors !== 16 || r9.runtime?.helperSha256 !== hash(helperBytes)) throw new Error("R11 R9 tensor authority mismatch");
  if (r7Runtime.preprocessingSha256 !== hash(correctedBytes) || canonical(r7Runtime.nativeClassOrder) !== canonical(NUDENET_320N.classes)) throw new Error("R11 corrected preprocessing/native class authority mismatch");
  const pythonById = new Map<string, any>(python.rows.map((row: any) => [row.candidateId, row]));
  if (python.rows.length !== 16 || !ids.every((id) => pythonById.has(id)) || python.rows.reduce((sum: number, row: any) => sum + row.detections.length, 0) !== 58) throw new Error("R11 canonical G8-B Python comparison authority mismatch");
  const candidatesById = new Map<string, any>(inventory.candidates.filter((candidate: any) => ids.includes(candidate.id)).map((candidate: any) => [candidate.id, candidate]));
  const selected = ids.map((id) => { const selection = g8b.selection.selected.find((row: any) => row.candidateId === id); const candidate = candidatesById.get(id); if (!candidate?.localAsset || candidate.sha256 !== selection.candidateSha256 || candidate.sha256 !== pythonById.get(id).candidateSha256) throw new Error(`R11 frozen candidate authority mismatch: ${id}`); return candidate; });
  const preregPayload = { schemaVersion: "STHN_I4_G8C_R11_PERSISTED_RAW_PREREGISTRATION_V1", phase: "I4-G8-C-R11", frozen16: ids.map((candidateId) => ({ candidateId, candidateSha256: pythonById.get(candidateId).candidateSha256 })), authorities: { g8bPreregistrationSha256: hash(g8bBytes), g8bPreregistrationFingerprint: g8b.preregistrationFingerprint, canonicalPythonSha256: hash(pythonBytes), canonicalPythonRetainedDetections: 58, r9Sha256: hash(r9Bytes), modelSha256: hash(modelBytes), openCvJsArtifactSha256: hash(opencvBytes) }, runtime: { node: process.version, onnxruntimeNode: JSON.parse(ortPackageBytes.toString()).version, provider: "cpu", openCvJsPackage: G8C_R6_PACKAGE, openCvJsVersion: G8C_R6_PACKAGE_VERSION }, sources: { runnerSha256: hash(runnerBytes), correctedPreprocessingSha256: hash(correctedBytes), canonicalFloat32HelperSha256: hash(helperBytes), persistenceHelperSha256: hash(persistenceBytes), postprocessorSha256: hash(postprocessorBytes) }, tensorAuthority: { result: r9.result, exactTensors: r9.parity.exactTensors, layout: "RGB HWC Uint8 -> RGB CHW Float32 [1,3,320,320]", requiredDigestMatch: true }, graph: { input: "images float32 [1,3,320,320]", output: "output0 float32 [1,22,2100]" }, detector: { nativeClassOrder: NUDENET_320N.classes, confidence: "per-anchor maximum native class score; no objectness, sigmoid, or softmax", initialConfidenceAtLeast: 0.2, nmsScoreAtLeast: 0.25, nmsIouAtMost: 0.45 }, comparison: { candidateLevelParityRequired: true, retainedDetectionCount: "exact", nativeClass: "exact", confidenceAbsolute: 0.02, boxPixelsAbsolute: 3, rawOutputRelative: 0.02, totals: "58 retained detections across 15/16 candidates" }, storage: { rawOutputDirectory: "raw-f32", writeOnce: true, persistedAndReloadedBeforePostprocess: true }, runCount: { authorizedValidModelRunsPerCandidate: 1, noRerunOrTuningAfterOutputsVisible: true }, scope: { frozen16Only: true, full558: false, unseen325: false, pythonInference: false, r10: false, thresholdOrNmsChanges: false, labels: false, training: false, productionWiring: false } };
  const preregistration = { ...preregPayload, semanticFingerprint: hash(canonical(preregPayload)), byteSha256: hash(Buffer.from(`${JSON.stringify(preregPayload, null, 2)}\n`)) };
  await mkdir(rawDirectory, { recursive: true }); await writeOnce("g8c-r11-preregistration.json", preregistration);
  // This deterministic gate is intentionally before session creation and image-byte access.
  const synthetic = new Float32Array([0, -0, 1, -1, Math.fround(1 / 3), Number.MAX_VALUE, Number.MIN_VALUE]); const syntheticFile = path.join(rawDirectory, "synthetic-persistence-gate.f32"); const persistedSynthetic = await persistR11Raw(syntheticFile, synthetic); const reloadedSynthetic = await reloadR11Raw(syntheticFile);
  if (persistedSynthetic.sha256 !== reloadedSynthetic.sha256 || persistedSynthetic.elementCount !== reloadedSynthetic.values.length || !Buffer.from(synthetic.buffer).equals(Buffer.from(reloadedSynthetic.values.buffer, reloadedSynthetic.values.byteOffset, reloadedSynthetic.values.byteLength))) throw new Error("R11 Float32 persistence/reload gate failed");
  const cv = await loadCv(); if (!cv?.Mat || !cv.resize || cv.CV_8UC3 !== 64 || cv.INTER_LINEAR !== 1) throw new Error("R11 frozen OpenCV resize contract unavailable");
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  if (canonical(session.inputNames) !== canonical(["images"]) || canonical(session.outputNames) !== canonical(["output0"])) throw new Error("R11 frozen ONNX graph contract mismatch");
  const rows: any[] = []; const manifest: any[] = [];
  try { for (const candidate of selected) {
    const bytes = await readFile(source(`evaluation-cache/image-moderation/benchmark/${candidate.localAsset}`)); if (hash(bytes) !== candidate.sha256) throw new Error(`R11 candidate SHA mismatch: ${candidate.id}`);
    const metadata = await sharp(bytes, { failOn: "error" }).metadata(); if (!metadata.width || !metadata.height) throw new Error(`R11 source geometry unavailable: ${candidate.id}`);
    const decoded = await decodeToVerifiedRgb(bytes); const square = squareVerifiedRgb(decoded); const inputMat = cv.matFromArray(square.height, square.width, cv.CV_8UC3, square.data); const resizedMat = new cv.Mat(); let tensorData: Float32Array;
    try { cv.resize(inputMat, resizedMat, new cv.Size(320, 320), 0, 0, cv.INTER_LINEAR); tensorData = canonicalFloat32RgbNchw(Uint8Array.from(resizedMat.data)); } finally { inputMat.delete(); resizedMat.delete(); }
    const inputSha256 = float32Digest(tensorData!); const r9Row = r9.parity.rows.find((row: any) => row.candidateId === candidate.id); if (!r9Row || r9Row.nodeTensorSha256 !== inputSha256 || !r9Row.exact) throw new Error(`R11 R9 tensor digest gate failed: ${candidate.id}`);
    const tensor = new ort.Tensor("float32", tensorData!, [1, 3, 320, 320]); let live: ort.Tensor | undefined;
    try { live = (await session.run({ images: tensor })).output0 as ort.Tensor; if (live.type !== "float32" || canonical(live.dims) !== canonical([1, 22, 2100])) throw new Error(`R11 raw output contract mismatch: ${candidate.id}`); const values = live.data as Float32Array; if (![...values].every(Number.isFinite)) throw new Error(`R11 non-finite raw output: ${candidate.id}`); const rawFile = path.join(rawDirectory, `${candidate.id}.f32`); const persisted = await persistR11Raw(rawFile, values); const reloaded = await reloadR11Raw(rawFile); if (persisted.sha256 !== reloaded.sha256 || persisted.elementCount !== reloaded.values.length || !Buffer.from(values.buffer, values.byteOffset, values.byteLength).equals(Buffer.from(reloaded.values.buffer, reloaded.values.byteOffset, reloaded.values.byteLength))) throw new Error(`R11 raw reload verification failed: ${candidate.id}`);
      const analysis = await postprocessPersistedR11Raw(rawFile, metadata.width, metadata.height); const reference = pythonById.get(candidate.id); const detections = compareStageADetections(reference.detections, analysis.detections, preregPayload.comparison); const rawRelative = rawOutputRelativeDelta(reference.raw, analysis.raw); const countPass = reference.detections.length === analysis.detections.length; const passed = countPass && detections.passed && rawRelative <= preregPayload.comparison.rawOutputRelative;
      manifest.push({ candidateId: candidate.id, inputTensorSha256: inputSha256, modelSha256: hash(modelBytes), outputName: "output0", dtype: "float32", shape: live.dims, elementCount: values.length, byteLength: persisted.byteLength, rawOutputSha256: persisted.sha256, finite: true, reloadVerified: true, identities: { node: process.version, onnxruntimeNode: preregPayload.runtime.onnxruntimeNode, openCvJsArtifactSha256: hash(opencvBytes), runnerSha256: hash(runnerBytes), postprocessorSha256: hash(postprocessorBytes) } });
      rows.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, inputTensorSha256: inputSha256, source: { width: metadata.width, height: metadata.height }, raw: analysis.raw, detections: analysis.detections, comparison: { retainedDetectionCount: { python: reference.detections.length, node: analysis.detections.length, pass: countPass }, detections, rawOutputRelative: rawRelative, passed } });
    } finally { live?.dispose(); tensor.dispose(); }
  } } finally { await session.release(); }
  const total = rows.reduce((sum, row) => sum + row.detections.length, 0); const withDetections = rows.filter((row) => row.detections.length > 0).length; const allPassed = rows.length === 16 && manifest.length === 16 && rows.every((row) => row.comparison.passed) && total === 58 && withDetections === 15;
  const rawManifestPayload = { schemaVersion: "STHN_I4_G8C_R11_RAW_OUTPUT_MANIFEST_V1", preregistrationSemanticFingerprint: preregistration.semanticFingerprint, syntheticPersistenceGate: { sha256: persistedSynthetic.sha256, elementCount: persistedSynthetic.elementCount, reloadVerified: true }, candidates: manifest }; const rawManifest = { ...rawManifestPayload, reportFingerprint: hash(canonical(rawManifestPayload)) };
  const reportPayload = { schemaVersion: "STHN_I4_G8C_R11_PERSISTED_RAW_PARITY_V1", status: allPassed ? "R11_PERSISTED_RAW_CANONICAL_PARITY_CONFIRMED" : "R11_PERSISTED_RAW_CANONICAL_PARITY_NOT_CONFIRMED", preregistration, rawManifestFingerprint: rawManifest.reportFingerprint, retainedDetections: total, candidatesWithDetections: withDetections, rows, scope: preregPayload.scope }; const report = { ...reportPayload, reportFingerprint: hash(canonical(reportPayload)) };
  await writeOnce("g8c-r11-raw-output-manifest.json", rawManifest); await writeOnce("g8c-r11-persisted-raw-parity.json", report); await writeFile(path.join(output, "g8c-r11-persisted-raw-parity.md"), `# I4-G8-C-R11\n\n${report.status}\n\n- Candidate-level parity: ${allPassed ? "confirmed" : "not confirmed"}\n- Retained detections: ${total}/58 across ${withDetections}/15 candidates\n- Raw Float32 artifacts: persisted, SHA-256 recorded, and reloaded before postprocessing.\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, retainedDetections: total, candidatesWithDetections: withDetections, reportFingerprint: report.reportFingerprint }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
