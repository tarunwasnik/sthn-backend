import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { tensorFromVerifiedRgb } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";
import {
  assertR6RgbSquare,
  compareR6Bytes,
  G8C_R6_CANDIDATE_IDS,
  G8C_R6_OPENCV_SHA256,
  G8C_R6_OUTPUT_BYTES,
  G8C_R6_PACKAGE,
  G8C_R6_PACKAGE_VERSION,
  sha256,
} from "../evaluation/imageModeration/opencvWasmR6Contract";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r6-opencv-wasm-real-resize-parity");
const r1Path = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r1-preprocessing-stage-isolation", "g8c-r1-preprocessing-stage-isolation.json");
const r5Path = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r5-opencv-wasm-evaluation", "g8c-r5-opencv-wasm-evaluation.json");
const r2Path = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r2-canonical-resize-parity", "g8c-r2-resize-comparison.json");
const sourcePath = path.join(root, "src", "scripts", "runG8CR6OpenCvWasmRealResizeParity.ts");
const python = path.join(root, "evaluation-cache", "image-moderation", "g8b-nudenet-reference-parity", "venv", "Scripts", "python.exe");
const canonicalScript = path.join(root, "src", "scripts", "g8cR1CanonicalPreprocess.py");
const npmIntegrity = "sha512-PIm+eB0MFtieXoNC2GRao0dv/02sehG+Nv2nSW5D6pQm6J/4WqvDHm0RyoqOmGYQm67jdGiaOdIeTShCY3PIUg==";

const loadCv = async (): Promise<any> => {
  const loaded = require(G8C_R6_PACKAGE);
  const host = globalThis as typeof globalThis & { cv?: any };
  if (loaded?.Mat) return loaded;
  if (loaded instanceof Promise) return loaded;
  if (host.cv?.Mat) return host.cv;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("OpenCV.js initialization timeout")), 30_000);
    loaded.onRuntimeInitialized = () => { clearTimeout(timeout); resolve(); };
  });
  return host.cv ?? loaded;
};

const writeOnce = (name: string, value: unknown): Promise<void> =>
  writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

void (async () => {
  const [r1Bytes, r2Bytes, r5Bytes, sourceBytes, inventoryBytes, packageBytes, opencvBytes] = await Promise.all([
    readFile(r1Path), readFile(r2Path), readFile(r5Path), readFile(sourcePath),
    readFile(path.join(root, "evaluation-cache", "image-moderation", "benchmark", "inventory-manifest.json")),
    readFile(path.join(root, "node_modules", "@techstark", "opencv-js", "package.json")),
    readFile(path.join(root, "node_modules", "@techstark", "opencv-js", "dist", "opencv.js")),
  ]);
  if (sha256(r1Bytes) !== "bb4442052d79fb9e40f36f269a181b0adf92fe8ed90c8826fbb58357e1ab9a96") throw new Error("Frozen R1 authority mismatch");
  if (sha256(r2Bytes) !== "f059afcf97162e13c8e33d2ad3e2521b479c41e7eb3c16e14da1bd62e160fb13") throw new Error("Frozen R2 authority mismatch");
  if (sha256(r5Bytes) !== "a76779e4ee85d9c8ba91cb90110dd3ffba0a0c0771d84c42aa064f738b1c1f41") throw new Error("Frozen R5 authority mismatch");
  if (sha256(opencvBytes) !== G8C_R6_OPENCV_SHA256 || opencvBytes.length !== 13_298_869) throw new Error("Frozen OpenCV.js artifact mismatch");
  const packageRecord = JSON.parse(packageBytes.toString("utf8"));
  if (packageRecord.version !== G8C_R6_PACKAGE_VERSION || packageRecord.license !== "Apache-2.0") throw new Error("Exact R5 package identity mismatch");
  const r1 = JSON.parse(r1Bytes.toString("utf8"));
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  const r1ById = new Map<string, any>(r1.python.map((row: any) => [row.candidateId, row]));
  const candidatesById = new Map<string, any>(inventory.candidates.map((candidate: any) => [candidate.id, candidate]));
  if (r1.reportFingerprint !== "476be9e20a4753e246551be6638d661da56f0e2dd4706cb65bb6e94fc8011e7e" || r1.comparison.globalRootCause !== "RESIZE_IS_PRIMARY_REMAINING_DIVERGENCE") throw new Error("Unexpected R1 report identity");
  if (JSON.stringify(r1.selection.map((row: any) => row.candidateId)) !== JSON.stringify(G8C_R6_CANDIDATE_IDS)) throw new Error("R6 candidate selection must equal frozen R1 selection");
  await mkdir(output, { recursive: true });
  const preregPayload = {
    schemaVersion: "STHN_I4_G8C_R6_REAL_RESIZE_PARITY_PREREGISTRATION_V1",
    candidateIds: G8C_R6_CANDIDATE_IDS,
    authorities: { r1Sha256: sha256(r1Bytes), r1Fingerprint: r1.reportFingerprint, r2Sha256: sha256(r2Bytes), r5Sha256: sha256(r5Bytes), r5Fingerprint: JSON.parse(r5Bytes.toString("utf8")).reportFingerprint },
    runtime: { node: process.version, package: G8C_R6_PACKAGE, version: G8C_R6_PACKAGE_VERSION, npmIntegrity, opencvJsBytes: opencvBytes.length, opencvJsSha256: sha256(opencvBytes) },
    evaluationSourceSha256: sha256(sourceBytes),
    canonicalAuthority: "Bounded Python/OpenCV preprocessing-only rerun is required because R1 retained canonical hashes/samples but not complete 320x320 RGB bytes.",
    input: "R1-authorized canonical Python/OpenCV square RGB bytes, verified against frozen candidate and square SHA-256 identities",
    matContract: "cv.matFromArray(squareHeight, squareWidth, cv.CV_8UC3, squareRgb); RGB interleaved Uint8; no alpha, BGR conversion, or color conversion",
    resizeCall: "cv.resize(source, destination, new cv.Size(320, 320), 0, 0, cv.INTER_LINEAR)",
    extraction: "Uint8Array.from(destination.data)", cleanup: "source.delete() and destination.delete() in finally",
    comparison: "byte equality, SHA-256, differing byte count/fraction, MAE, maximum absolute difference",
    acceptance: "All four outputs must have zero differing bytes, zero MAE, zero maximum difference, and equal canonical/WASM SHA-256.",
    prohibitions: { onlyAuthorizedCandidates: true, modelInference: false, onnxSession: false, frozen16ModelRun: false, full558: false, thresholdOrNmsChanges: false, labels: false, training: false, productionWiring: false, implementationModificationAfterResultsVisible: true },
  };
  const preregistration = { ...preregPayload, preregistrationFingerprint: sha256(JSON.stringify(preregPayload)) };
  await writeOnce("g8c-r6-preregistration.json", preregistration);

  const initializedAt = performance.now();
  const cv = await loadCv();
  const initializationMs = performance.now() - initializedAt;
  if (!cv?.Mat || !cv.resize || cv.CV_8UC3 === undefined || cv.INTER_LINEAR === undefined) throw new Error("OpenCV.js required APIs unavailable");
  if (cv.CV_8UC3 !== 64 || cv.INTER_LINEAR !== 1) throw new Error("OpenCV.js R5 constants mismatch");
  const rows: any[] = [];
  for (const candidateId of G8C_R6_CANDIDATE_IDS) {
    const candidate = candidatesById.get(candidateId);
    const r1Row = r1ById.get(candidateId);
    if (!candidate?.localAsset || !r1Row) throw new Error(`Missing frozen authority for ${candidateId}`);
    const image = await readFile(path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset));
    if (sha256(image) !== candidate.sha256 || candidate.sha256 !== r1Row.candidateSha256) throw new Error(`Source identity mismatch: ${candidateId}`);
    const { stdout } = await execFileAsync(python, [canonicalScript, path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset)], { maxBuffer: 64 * 1024 * 1024 });
    const canonical = JSON.parse(stdout);
    const square = Buffer.from(canonical.square.base64, "base64");
    const canonicalResized = Buffer.from(canonical.resized.base64, "base64");
    const canonicalTensor = Buffer.from(canonical.manualTensor.base64, "base64");
    assertR6RgbSquare(square, canonical.square.width, canonical.square.height, canonical.square.channels);
    if (sha256(square) !== r1Row.square.sha256 || sha256(canonicalResized) !== r1Row.resized.sha256 || canonicalResized.length !== G8C_R6_OUTPUT_BYTES) throw new Error(`Canonical R1 resize authority mismatch: ${candidateId}`);
    const source = cv.matFromArray(canonical.square.height, canonical.square.width, cv.CV_8UC3, square);
    const destination = new cv.Mat();
    let wasm: Uint8Array;
    try {
      cv.resize(source, destination, new cv.Size(320, 320), 0, 0, cv.INTER_LINEAR);
      if (destination.cols !== 320 || destination.rows !== 320 || destination.channels() !== 3) throw new Error(`WASM geometry mismatch: ${candidateId}`);
      wasm = Uint8Array.from(destination.data);
    } finally { source.delete(); destination.delete(); }
    const comparison = compareR6Bytes(canonicalResized, wasm!);
    const wasmTensor = tensorFromVerifiedRgb({ data: Buffer.from(wasm!), width: 320, height: 320, channels: 3 });
    const wasmTensorBytes = Buffer.from(wasmTensor.data.buffer, wasmTensor.data.byteOffset, wasmTensor.data.byteLength);
    rows.push({ candidateId, sourceSha256: candidate.sha256, square: { width: canonical.square.width, height: canonical.square.height, channels: 3, inputRgbByteLength: square.length, inputRgbSha256: sha256(square) }, canonicalResizedOutputSha256: sha256(canonicalResized), wasmResizedOutputSha256: sha256(wasm!), exactEquality: comparison.exactEquality, differingBytes: comparison.differingBytes, differingFraction: comparison.differingFraction, meanAbsoluteDifference: comparison.meanAbsoluteDifference, maxAbsoluteDifference: comparison.maxAbsoluteDifference, output: { width: 320, height: 320, channels: 3, byteLength: wasm!.length }, endToEndTensor: { shape: wasmTensor.shape, elementCount: wasmTensor.data.length, finiteCount: wasmTensor.finiteCount, canonicalSha256: sha256(canonicalTensor), wasmSha256: sha256(wasmTensorBytes), exactEquality: canonicalTensor.equals(wasmTensorBytes) } });
  }
  const allExact = rows.every((row) => row.exactEquality);
  const primary = { schemaVersion: "STHN_I4_G8C_R6_REAL_RESIZE_PARITY_V1", preregistrationFingerprint: preregistration.preregistrationFingerprint, status: allExact ? "OPENCV_WASM_REAL_RESIZE_PARITY_CONFIRMED" : "OPENCV_WASM_REAL_RESIZE_PARITY_NOT_CONFIRMED", canonicalRerun: { required: true, implementation: "g8cR1CanonicalPreprocess.py", preprocessingOnly: true, outputBytesPersisted: false }, rows, runtime: { initializationMs, cv8uc3: cv.CV_8UC3, interLinear: cv.INTER_LINEAR, matCleanup: "source and destination Mats deleted for every control", runtimeError: null }, prohibitions: preregPayload.prohibitions };
  const parity = { ...primary, reportFingerprint: sha256(JSON.stringify(primary)) };
  await writeOnce("g8c-r6-canonical-resize-authority.json", { schemaVersion: "STHN_I4_G8C_R6_CANONICAL_RESIZE_AUTHORITY_V1", source: "bounded Python/OpenCV preprocessing-only rerun", candidateIds: G8C_R6_CANDIDATE_IDS, rows: rows.map((row) => ({ candidateId: row.candidateId, sourceSha256: row.sourceSha256, square: row.square, canonicalResizedOutputSha256: row.canonicalResizedOutputSha256 })), authorityFingerprint: sha256(JSON.stringify(rows.map((row) => ({ candidateId: row.candidateId, sourceSha256: row.sourceSha256, square: row.square, canonicalResizedOutputSha256: row.canonicalResizedOutputSha256 })))) });
  await writeOnce("g8c-r6-real-resize-parity.json", parity);
  if (allExact) await writeOnce("g8c-r6-end-to-end-preprocessing-parity.json", { schemaVersion: "STHN_I4_G8C_R6_END_TO_END_PREPROCESSING_PARITY_V1", preregistrationFingerprint: preregistration.preregistrationFingerprint, allExact: rows.every((row) => row.endToEndTensor.exactEquality), rows: rows.map((row) => ({ candidateId: row.candidateId, ...row.endToEndTensor })), reportFingerprint: sha256(JSON.stringify(rows.map((row) => ({ candidateId: row.candidateId, ...row.endToEndTensor })))) });
  const finalPayload = { schemaVersion: "STHN_I4_G8C_R6_OPENCV_WASM_REAL_RESIZE_PARITY_V1", status: parity.status, evaluationSourceSha256: sha256(sourceBytes), preregistrationFingerprint: preregistration.preregistrationFingerprint, parity, historicalAuthorities: preregPayload.authorities, package: preregPayload.runtime, implementation: { matContract: preregPayload.matContract, resizeCall: preregPayload.resizeCall, extraction: preregPayload.extraction, cleanup: preregPayload.cleanup }, prohibitions: preregPayload.prohibitions };
  const final = { ...finalPayload, reportFingerprint: sha256(JSON.stringify(finalPayload)) };
  await writeOnce("g8c-r6-opencv-wasm-real-resize-parity.json", final);
  await writeFile(path.join(output, "g8c-r6-opencv-wasm-real-resize-parity.md"), `# I4-G8-C-R6\n\n${final.status}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: final.status, preregistrationFingerprint: preregistration.preregistrationFingerprint, reportFingerprint: final.reportFingerprint, allExact }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
