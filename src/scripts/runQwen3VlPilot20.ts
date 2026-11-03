import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Qwen3VlLlamaCppRuntime } from "../evaluation/imageModeration/qwen3VlLlamaCppRuntime";
import { Qwen3VlOfflineEvaluationAdapter, writeQwen3VlRawOutputArtifacts } from "../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { buildQwen3VlPilotReport, loadQwen3VlPilotInputs, Qwen3VlPilotRuntimeFailure, runQwen3VlPilotInference, writeQwen3VlPilotReport } from "../evaluation/imageModeration/qwen3VlPilot20";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const root = process.cwd();
const revision = "52d6c8ffea26cc873ac5ad116f8631268d7eb503";
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, "Qwen3VL-2B-Instruct-Q4_K_M.gguf");
const multimodalProjectorPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf");
const executablePath = path.join(root, "evaluation-cache", "image-moderation", "llama.cpp", "b8074", "bin", "llama-mtmd-cli.exe");
const benchmarkRoot = path.join(root, "evaluation-cache", "image-moderation", "benchmark");
const adamCoddResultsPath = path.join(root, "evaluation-output", "image-moderation", "i4-g10b-adamcodd-558-evaluation", "candidate-results.json");
const outputDirectory = path.join(root, "evaluation-output", "image-moderation", "qwen3-vl-v2b2a-pilot20");

void (async () => {
  if (process.env.NODE_ENV !== "development") throw new Error("Qwen pilot may run only with NODE_ENV=development");
  const [model, projector] = await Promise.all([readFile(modelPath), readFile(multimodalProjectorPath)]);
  const runtime = new Qwen3VlLlamaCppRuntime({ executablePath, buildId: "b8074", commandTimeoutMs: 300_000, contextSize: 4096 });
  const adapter = new Qwen3VlOfflineEvaluationAdapter({ model: { path: modelPath, sha256: sha256(model) }, multimodalProjector: { path: multimodalProjectorPath, sha256: sha256(projector) }, modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF", revision, maxOutputTokens: 160 }, runtime);
  const inputs = await loadQwen3VlPilotInputs({ benchmarkRoot });
  let inferenceRows: Awaited<ReturnType<typeof runQwen3VlPilotInference>>;
  try { inferenceRows = await runQwen3VlPilotInference(adapter, inputs); }
  catch (error) {
    if (error instanceof Qwen3VlPilotRuntimeFailure) {
      await writeQwen3VlPilotReport({ schemaVersion: "STHN_QWEN3_VL_PILOT_INTERRUPTED_V1", attempted: error.rows.length, failedFixtureId: error.failedFixtureId, errorCode: error.errorCode, rows: error.rows, candidateMetadata: adapter.getCandidateMetadata() }, outputDirectory);
      await writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), outputDirectory);
    }
    throw error;
  }
  const report = await buildQwen3VlPilotReport({ benchmarkRoot, adamCoddResultsPath, inferenceRows, candidateMetadata: adapter.getCandidateMetadata() });
  await writeQwen3VlPilotReport(report, outputDirectory);
  await writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), outputDirectory);
  console.log(JSON.stringify({ attempted: report.attempted, completed: report.completed, statusCounts: report.statusCounts, rawOutputSchema: report.rawOutputSchema, reportDirectory: outputDirectory }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
