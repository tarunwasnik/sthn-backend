import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Qwen3VlLlamaCppRuntime } from "../evaluation/imageModeration/qwen3VlLlamaCppRuntime";
import { Qwen3VlOfflineEvaluationAdapter, writeQwen3VlRawOutputArtifacts } from "../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { loadQwen3VlPilotInputs, runQwen3VlPilotInference, writeQwen3VlPilotReport } from "../evaluation/imageModeration/qwen3VlPilot20";
import { QWEN3_VL_PILOT_20 } from "../evaluation/imageModeration/qwen3VlPilot20.manifest";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const root = process.cwd();
const revision = "52d6c8ffea26cc873ac5ad116f8631268d7eb503";
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, "Qwen3VL-2B-Instruct-Q4_K_M.gguf");
const multimodalProjectorPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf");
const executablePath = path.join(root, "evaluation-cache", "image-moderation", "llama.cpp", "b8074", "bin", "llama-mtmd-cli.exe");
const benchmarkRoot = path.join(root, "evaluation-cache", "image-moderation", "benchmark");
/** A schema-versioned destination preserves the prior V1 diagnostic artifact. */
const outputDirectory = path.join(root, "evaluation-output", "image-moderation", "qwen3-vl-v2b2a-r-output-schema-v2-diagnostic");

void (async () => {
  if (process.env.NODE_ENV !== "development") throw new Error("Qwen pilot diagnostic may run only with NODE_ENV=development");
  const [model, projector] = await Promise.all([readFile(modelPath), readFile(multimodalProjectorPath)]);
  const runtime = new Qwen3VlLlamaCppRuntime({ executablePath, buildId: "b8074", commandTimeoutMs: 300_000, contextSize: 4096 });
  const adapter = new Qwen3VlOfflineEvaluationAdapter({ model: { path: modelPath, sha256: sha256(model) }, multimodalProjector: { path: multimodalProjectorPath, sha256: sha256(projector) }, modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF", revision, maxOutputTokens: 160 }, runtime);
  const inputs = await loadQwen3VlPilotInputs({ benchmarkRoot, selection: [QWEN3_VL_PILOT_20[0]], requireCompletePilotSelection: false });
  const rows = await runQwen3VlPilotInference(adapter, inputs);
  const diagnostic = { schemaVersion: "STHN_QWEN3_VL_PILOT_DIAGNOSTIC_V2", fixtureId: QWEN3_VL_PILOT_20[0].fixtureId, candidateMetadata: adapter.getCandidateMetadata(), rows };
  await writeQwen3VlPilotReport(diagnostic, outputDirectory);
  await writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), outputDirectory);
  console.log(JSON.stringify(diagnostic, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
