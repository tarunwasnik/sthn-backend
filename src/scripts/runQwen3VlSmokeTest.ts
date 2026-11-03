import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Qwen3VlOfflineEvaluationAdapter, writeQwen3VlRawOutputArtifacts } from "../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { Qwen3VlLlamaCppRuntime } from "../evaluation/imageModeration/qwen3VlLlamaCppRuntime";

if (process.env.NODE_ENV === "production") throw new Error("Qwen offline smoke test is development-only");

const root = path.resolve(process.cwd(), "evaluation-cache", "image-moderation");
const revision = "52d6c8ffea26cc873ac5ad116f8631268d7eb503";
const modelPath = path.join(root, "qwen3-vl-2b-instruct-gguf", revision, "Qwen3VL-2B-Instruct-Q4_K_M.gguf");
const multimodalProjectorPath = path.join(root, "qwen3-vl-2b-instruct-gguf", revision, "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf");
const executablePath = path.join(root, "llama.cpp", "b8074", "bin", "llama-mtmd-cli.exe");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const createSyntheticFixture = () => sharp(Buffer.from(`<svg width="320" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="240" fill="#1d4ed8"/><circle cx="160" cy="120" r="70" fill="#facc15"/><rect x="145" y="90" width="30" height="60" fill="#dc2626"/></svg>`)).png().toBuffer();

(async () => {
  const [model, projector, bytes] = await Promise.all([readFile(modelPath), readFile(multimodalProjectorPath), createSyntheticFixture()]);
  const runtime = new Qwen3VlLlamaCppRuntime({ executablePath, buildId: "b8074", commandTimeoutMs: 300_000, contextSize: 4096 });
  const adapter = new Qwen3VlOfflineEvaluationAdapter({ model: { path: modelPath, sha256: sha256(model) }, multimodalProjector: { path: multimodalProjectorPath, sha256: sha256(projector) }, modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF", revision, maxOutputTokens: 160 }, runtime);
  const result = await adapter.evaluate({ fixture: { id: "sthn-qwen-v2b1-synthetic-colour-shapes", description: "Synthetic blue field with a yellow circle and red rectangle.", asset: "generated-in-memory.png", expectedBySurface: { USER_PROFILE_PHOTO: { decision: "PASS", categories: [] } }, requiredCapabilities: ["NSFW"], difficulty: "EASY", tags: ["synthetic", "safe-harness"], rationale: "Local smoke fixture only.", provenance: { kind: "SYNTHETIC" } }, surface: "USER_PROFILE_PHOTO", assetPath: "generated-in-memory.png", bytes });
  const outputDirectory = path.resolve(process.cwd(), "evaluation-output", "image-moderation", "qwen3-vl-v2b1-smoke");
  await mkdir(outputDirectory, { recursive: true });
  const rawOutputPaths = await writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), outputDirectory);
  const record = adapter.getEvaluationRecords()[0];
  console.log(JSON.stringify({ candidate: adapter.getCandidateMetadata(), decision: result, schemaValid: record?.schemaValid ?? false, latencyMs: record?.performance?.inferenceLatencyMs ?? null, processRssBytes: record?.performance?.processRssBytes ?? null, freeSystemMemoryBytes: record?.performance?.freeSystemMemoryBytes ?? null, rawOutputArtifactCount: rawOutputPaths.length }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
