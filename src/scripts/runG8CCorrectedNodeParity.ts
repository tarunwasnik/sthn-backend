import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { preprocessCorrectedNudeNet } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";
import { analyzeNudeNetOutput, compareStageADetections, rawOutputRelativeDelta } from "../evaluation/imageModeration/nudeNet320nStageAComparison";

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-corrected-nudenet-development-evaluation");
const read = async (relative: string): Promise<Buffer> => readFile(path.join(root, relative));

void (async () => {
  const paths = {
    preregistration: "evaluation-output/image-moderation/i4-g8c-corrected-nudenet-development-evaluation/g8c-stage-a-preregistration.json",
    implementation: "src/evaluation/imageModeration/nudeNet320nCorrectedPreprocess.ts",
    model: "evaluation-cache/image-moderation/specialists/nudenet-320n/320n.onnx",
    python: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json",
    g8bPrereq: "evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json",
    inventory: "evaluation-cache/image-moderation/benchmark/inventory-manifest.json",
  } as const;
  const [preregistrationBytes, implementation, model, pythonBytes, g8bPrereqBytes, inventoryBytes] = await Promise.all(Object.values(paths).map(read));
  if (hash(implementation) !== "0a4a18d29c9d5a9b700d7ff2adf87d8edb0e84f2a12590edbaae4f50c7cdd981" ||
      hash(preregistrationBytes) !== "617ecec276c68a0d6f44e3536ae150365ab7078eb24f50233278331122937642" ||
      hash(model) !== "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f" ||
      hash(pythonBytes) !== "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db") throw new Error("Stage-A frozen authority hash mismatch before ONNX session");
  const preregistration = JSON.parse(preregistrationBytes.toString("utf8"));
  const g8bPrereq = JSON.parse(g8bPrereqBytes.toString("utf8"));
  const python = JSON.parse(pythonBytes.toString("utf8"));
  const inventory = JSON.parse(inventoryBytes.toString("utf8"));
  if (preregistration.preregistrationFingerprint !== "49b49347be6cd5b9c9ad013b13545bfd8d997fbe0f6dbd92cdfdf4264e14435d") throw new Error("Stage-A preregistration fingerprint mismatch");
  const ids: string[] = preregistration.subset.candidateIds;
  const frozenIds: string[] = g8bPrereq.selection.selected.map((item: { candidateId: string }) => item.candidateId);
  if (ids.length !== 16 || new Set(ids).size !== 16 || JSON.stringify(ids) !== JSON.stringify(frozenIds)) throw new Error("Stage-A candidate subset differs from frozen G8-B selection");
  const pythonById = new Map<string, any>(python.rows.map((row: any) => [row.candidateId, row]));
  if (pythonById.size !== 16 || !ids.every((id) => pythonById.has(id))) throw new Error("Canonical Python reference differs from frozen subset");
  const byId = new Map<string, any>(inventory.candidates.map((candidate: any) => [candidate.id, candidate]));
  const selected = ids.map((id) => {
    const candidate = byId.get(id);
    if (!candidate || !candidate.localAsset || candidate.sha256 !== pythonById.get(id).candidateSha256) throw new Error(`Invalid frozen candidate authority: ${id}`);
    return candidate;
  });

  const session = await ort.InferenceSession.create(path.join(root, paths.model), { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  if (session.inputNames.length !== 1 || session.inputNames[0] !== "images" || session.outputNames.length !== 1 || session.outputNames[0] !== "output0") throw new Error("Frozen NudeNet graph contract mismatch");
  const rows: any[] = [];
  try {
    for (const candidate of selected) {
      const image = await readFile(path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset));
      if (hash(image) !== candidate.sha256) throw new Error(`Source SHA mismatch: ${candidate.id}`);
      const source = await sharp(image, { failOn: "error" }).metadata();
      if (!source.width || !source.height) throw new Error(`Missing source geometry: ${candidate.id}`);
      const input = await preprocessCorrectedNudeNet(image);
      const tensor = new ort.Tensor("float32", input.tensor.data, [...input.tensor.shape]);
      let result: ort.Tensor | undefined;
      try {
        result = (await session.run({ images: tensor })).output0 as ort.Tensor;
        const analysis = analyzeNudeNetOutput(result.data as Float32Array, source.width, source.height);
        rows.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, source: { width: source.width, height: source.height, format: source.format ?? null }, tensor: { shape: input.tensor.shape, count: input.tensor.data.length, finite: input.tensor.finiteCount, min: input.tensor.min, max: input.tensor.max, mean: input.tensor.mean, digest: input.tensor.digest }, ...analysis });
      } finally {
        result?.dispose();
        tensor.dispose();
      }
    }
  } finally {
    await session.release();
  }
  if (rows.length !== 16) throw new Error("Stage-A did not account for exactly 16 candidates");
  const tolerances = preregistration.comparison.numericalTolerances;
  const comparisons = rows.map((row) => {
    const reference = pythonById.get(row.candidateId);
    const detection = compareStageADetections(reference.detections, row.detections, tolerances);
    const rawRelativeDelta = rawOutputRelativeDelta(reference.raw, row.raw);
    const tensorStatsPass = ["min", "max", "mean"].every((key) => Math.abs(row.tensor[key] - reference.tensor[key]) <= tolerances.tensorStatisticsAbsolute);
    const rawPass = row.raw.shape.join(",") === reference.raw.shape.join(",") && rawRelativeDelta <= tolerances.rawOutputRelative;
    const presencePass = Boolean(reference.detections.length) === Boolean(row.detections.length);
    const countPass = reference.detections.length === row.detections.length;
    return { candidateId: row.candidateId, pythonDetectionCount: reference.detections.length, nodeDetectionCount: row.detections.length, presencePass, countPass, tensorStatsPass, rawPass, rawRelativeDelta, detection, passed: presencePass && countPass && tensorStatsPass && rawPass && detection.passed };
  });
  const status = comparisons.every((comparison) => comparison.passed) ? "CORRECTED_NODE_PARITY_CONFIRMED" : "CORRECTED_NODE_PARITY_NOT_CONFIRMED";
  const payload = { schemaVersion: "STHN_I4_G8C_CORRECTED_NODE_PARITY_V1", phase: "I4-G8-C_STAGE_A", status, authority: preregistration.authority, stageAPreregistrationFingerprint: preregistration.preregistrationFingerprint, runtime: { provider: "cpu", inputNames: session.inputNames, outputNames: session.outputNames }, execution: { candidates: rows.length, selectedCandidateIds: ids, fullDevelopmentRun: false }, correctedNode: { retainedDetections: rows.reduce((count, row) => count + row.detections.length, 0), candidatesWithDetections: rows.filter((row) => row.detections.length).length, rows }, canonicalPython: { retainedDetections: python.rows.reduce((count: number, row: any) => count + row.detections.length, 0), candidatesWithDetections: python.rows.filter((row: any) => row.detections.length).length, sha256: hash(pythonBytes) }, comparison: { tolerances, comparisons, earliestRemainingMaterialDivergence: status === "CORRECTED_NODE_PARITY_CONFIRMED" ? null : "CORRECTED_PREPROCESSING_OR_RUNTIME_OUTPUT" }, prohibitions: { stageBExecuted: false, thresholdTuning: false, candidateChanges: false, unseen: false, g3: false, gantMan: false, owen: false, e5o: false, training: false, production: false } };
  const report = { ...payload, reportFingerprint: hash(JSON.stringify(payload)) };
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "g8c-corrected-node-parity.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(output, "g8c-stage-a-comparison.json"), `${JSON.stringify(report.comparison, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status, reportFingerprint: report.reportFingerprint, retainedDetections: payload.correctedNode.retainedDetections, candidatesWithDetections: payload.correctedNode.candidatesWithDetections }));
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
