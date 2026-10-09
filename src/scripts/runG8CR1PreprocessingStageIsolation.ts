import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeToVerifiedRgb, resizeVerifiedSquareRgb, squareVerifiedRgb, tensorFromVerifiedRgb } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";
import { selectG8CR1DiagnosticCandidates } from "../evaluation/imageModeration/nudeNet320nStageIsolation";

const execFileAsync = promisify(execFile);
const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r1-preprocessing-stage-isolation");
const read = (relative: string): Promise<Buffer> => readFile(path.join(root, relative));

const compareBytes = (left: Buffer, right: Buffer) => {
  if (left.length !== right.length) return { exact: false, lengthEqual: false, differingBytes: null, differingFraction: null, maxAbsoluteDifference: null, meanAbsoluteDifference: null };
  let differingBytes = 0, maxAbsoluteDifference = 0, sum = 0;
  for (let index = 0; index < left.length; index += 1) { const delta = Math.abs(left[index] - right[index]); if (delta) differingBytes += 1; maxAbsoluteDifference = Math.max(maxAbsoluteDifference, delta); sum += delta; }
  return { exact: differingBytes === 0, lengthEqual: true, differingBytes, differingFraction: differingBytes / left.length, maxAbsoluteDifference, meanAbsoluteDifference: sum / left.length };
};
const publicStage = (stage: any) => ({ width: stage.width, height: stage.height, channels: stage.channels, length: stage.length, sha256: stage.sha256, sample: stage.sample });

void (async () => {
  const stageAPath = "evaluation-output/image-moderation/i4-g8c-corrected-nudenet-development-evaluation/g8c-corrected-node-parity.json";
  const preregPath = "evaluation-output/image-moderation/i4-g8c-corrected-nudenet-development-evaluation/g8c-stage-a-preregistration.json";
  const implementationPath = "src/evaluation/imageModeration/nudeNet320nCorrectedPreprocess.ts";
  const [stageABytes, preregBytes, implementationBytes, inventoryBytes] = await Promise.all([read(stageAPath), read(preregPath), read(implementationPath), read("evaluation-cache/image-moderation/benchmark/inventory-manifest.json")]);
  if (hash(stageABytes) !== "9a4d3d17fd8e8d8cb78ad64785568e242f3c708e150033001c6370ce29237be2" || hash(preregBytes) !== "617ecec276c68a0d6f44e3536ae150365ab7078eb24f50233278331122937642" || hash(implementationBytes) !== "0a4a18d29c9d5a9b700d7ff2adf87d8edb0e84f2a12590edbaae4f50c7cdd981") throw new Error("Frozen G8-C Stage-A authority mismatch");
  const stageA = JSON.parse(stageABytes.toString("utf8"));
  const prereg = JSON.parse(preregBytes.toString("utf8"));
  const selection = selectG8CR1DiagnosticCandidates(prereg.subset.candidateIds, stageA.comparison.comparisons);
  await mkdir(output, { recursive: true });
  const selectionPayload = { schemaVersion: "STHN_I4_G8C_R1_SELECTION_V1", stageAResultFingerprint: stageA.reportFingerprint, frozenSubsetFingerprint: prereg.preregistrationFingerprint, selection };
  await writeFile(path.join(output, "g8c-r1-diagnostic-selection.json"), `${JSON.stringify({ ...selectionPayload, selectionFingerprint: hash(JSON.stringify(selectionPayload)) }, null, 2)}\n`, { flag: "wx" });
  const inventory = JSON.parse(inventoryBytes.toString("utf8")); const byId = new Map<string, any>(inventory.candidates.map((candidate: any) => [candidate.id, candidate]));
  const pythonRows: any[] = [], nodeRows: any[] = [], comparisons: any[] = [];
  const python = path.join(root, "evaluation-cache", "image-moderation", "g8b-nudenet-reference-parity", "venv", "Scripts", "python.exe");
  for (const selected of selection) {
    const candidate = byId.get(selected.candidateId); if (!candidate?.localAsset) throw new Error(`Missing frozen source: ${selected.candidateId}`);
    const imagePath = path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset);
    const image = await readFile(imagePath); if (hash(image) !== candidate.sha256) throw new Error(`Source SHA mismatch: ${selected.candidateId}`);
    const { stdout } = await execFileAsync(python, [path.join(root, "src", "scripts", "g8cR1CanonicalPreprocess.py"), imagePath], { maxBuffer: 64 * 1024 * 1024 });
    const canonical = JSON.parse(stdout);
    const decode = await decodeToVerifiedRgb(image); const square = squareVerifiedRgb(decode); const resized = await resizeVerifiedSquareRgb(square); const tensor = tensorFromVerifiedRgb(resized);
    const nodeStages = { rgb: { width: decode.width, height: decode.height, channels: decode.channels, length: decode.data.length, sha256: hash(decode.data), sample: [...decode.data.subarray(0, 24)] }, square: { width: square.width, height: square.height, channels: square.channels, length: square.data.length, sha256: hash(square.data), sample: [...square.data.subarray(0, 24)] }, resized: { width: resized.width, height: resized.height, channels: resized.channels, length: resized.data.length, sha256: hash(resized.data), sample: [...resized.data.subarray(0, 24)] }, tensor: { shape: tensor.shape, length: tensor.data.length, sha256: tensor.digest, sample: [...tensor.data.subarray(0, 12)] } };
    const canonicalRgb = Buffer.from(canonical.rgb.base64, "base64"), canonicalSquare = Buffer.from(canonical.square.base64, "base64"), canonicalResized = Buffer.from(canonical.resized.base64, "base64"), canonicalTensor = Buffer.from(canonical.tensor.base64, "base64");
    const crossResize = await resizeVerifiedSquareRgb({ data: canonicalSquare, width: canonical.square.width, height: canonical.square.height, channels: canonical.square.channels });
    const crossTensor = tensorFromVerifiedRgb(crossResize);
    const tensorBytes = Buffer.from(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
    const crossTensorBytes = Buffer.from(crossTensor.data.buffer, crossTensor.data.byteOffset, crossTensor.data.byteLength);
    const decodeComparison = compareBytes(canonicalRgb, decode.data);
    const squareComparison = compareBytes(canonicalSquare, square.data);
    const resizeComparison = compareBytes(canonicalResized, crossResize.data);
    const nodeEndToEndResizeComparison = compareBytes(canonicalResized, resized.data);
    const normalizationComparison = compareBytes(canonicalTensor, crossTensorBytes);
    const nchwComparison = compareBytes(crossTensorBytes, tensorBytes);
    const earliest = !decodeComparison.exact ? "DECODE_DIVERGENCE" : !squareComparison.exact ? "SQUARE_CONSTRUCTION_DIVERGENCE" : !resizeComparison.exact ? "RESIZE_DIVERGENCE" : !normalizationComparison.exact ? "FLOAT_NORMALIZATION_DIVERGENCE" : !nchwComparison.exact ? "NCHW_CONSTRUCTION_DIVERGENCE" : "NO_PREPROCESSING_DIVERGENCE";
    pythonRows.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, native: publicStage(canonical.native), rgb: publicStage(canonical.rgb), square: publicStage(canonical.square), resized: publicStage(canonical.resized), tensor: { shape: canonical.tensor.shape, length: canonical.tensor.length, sha256: canonical.tensor.sha256, sample: canonical.tensor.sample } });
    nodeRows.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, ...nodeStages, crossFeedCanonicalSquareResize: { width: crossResize.width, height: crossResize.height, channels: crossResize.channels, length: crossResize.data.length, sha256: hash(crossResize.data) } });
    comparisons.push({ candidateId: candidate.id, sourceSha256: candidate.sha256, decodeComparison, squareComparison, sameSquareResizeComparison: resizeComparison, nodeEndToEndResizeComparison, normalizationComparison, nchwComparison, earliestDivergence: earliest });
  }
  const stages = comparisons.map((comparison) => comparison.earliestDivergence);
  const rootCause = stages.every((stage) => stage === "DECODE_DIVERGENCE") ? "DECODE_IS_PRIMARY_REMAINING_DIVERGENCE" : stages.some((stage) => stage === "DECODE_DIVERGENCE") && stages.some((stage) => stage === "RESIZE_DIVERGENCE") ? "DECODE_AND_RESIZE_DIVERGE" : stages.every((stage) => stage === "RESIZE_DIVERGENCE") ? "RESIZE_IS_PRIMARY_REMAINING_DIVERGENCE" : stages.every((stage) => stage === "NO_PREPROCESSING_DIVERGENCE") ? "NO_MATERIAL_PREPROCESSING_DIVERGENCE" : "OTHER_PREPROCESSING_STAGE_DIVERGENCE";
  const payload = { schemaVersion: "STHN_I4_G8C_R1_PREPROCESSING_STAGE_ISOLATION_V1", phase: "I4-G8-C-R1", authority: { stageAResultFingerprint: stageA.reportFingerprint, stageAResultSha256: hash(stageABytes), correctedPreprocessingSha256: hash(implementationBytes), stageAPreregistrationFingerprint: prereg.preregistrationFingerprint }, selection, canonicalPythonPreprocessingRerun: true, python: pythonRows, node: nodeRows, comparison: { rows: comparisons, globalRootCause: rootCause }, prohibitions: { modelInference: false, stageBExecuted: false, full558: false, thresholdChanges: false, unseen: false, g3: false, gantMan: false, owen: false, e5o: false, training: false, production: false } };
  const report = { ...payload, reportFingerprint: hash(JSON.stringify(payload)) };
  await writeFile(path.join(output, "g8c-r1-python-preprocessing.json"), `${JSON.stringify(pythonRows, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(output, "g8c-r1-node-preprocessing.json"), `${JSON.stringify(nodeRows, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(output, "g8c-r1-stage-comparison.json"), `${JSON.stringify(report.comparison, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(output, "g8c-r1-preprocessing-stage-isolation.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(output, "g8c-r1-preprocessing-stage-isolation.md"), `# I4-G8-C-R1\n\nRoot cause: ${rootCause}\n`, { flag: "wx" });
  console.log(JSON.stringify({ selection: selection.map((item) => item.candidateId), rootCause, reportFingerprint: report.reportFingerprint }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
