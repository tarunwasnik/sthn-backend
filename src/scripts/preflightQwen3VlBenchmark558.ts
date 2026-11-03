import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { QWEN3_VL_558_CONFIG, loadQwen3VlBenchmark558Fixtures } from "../evaluation/imageModeration/qwen3VlBenchmark558";

const root = process.cwd();
const revision = QWEN3_VL_558_CONFIG.revision;
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, QWEN3_VL_558_CONFIG.modelFilename);
const projectorPath = path.join(root, "evaluation-cache", "image-moderation", "qwen3-vl-2b-instruct-gguf", revision, QWEN3_VL_558_CONFIG.projectorFilename);
const executablePath = path.join(root, "evaluation-cache", "image-moderation", "llama.cpp", QWEN3_VL_558_CONFIG.runtime.build, "bin", QWEN3_VL_558_CONFIG.runtime.executable);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

void (async () => {
  // This deliberately does not construct a runtime, spawn a process, or read image bytes into inference.
  const fixtures = await loadQwen3VlBenchmark558Fixtures(path.join(root, "evaluation-cache", "image-moderation", "benchmark"));
  const [model, projector] = await Promise.all([readFile(modelPath), readFile(projectorPath)]);
  await access(executablePath); if (!(await stat(executablePath)).isFile()) throw new Error("Qwen llama.cpp executable is not a file");
  if (digest(model) !== QWEN3_VL_558_CONFIG.modelSha256) throw new Error("Qwen 558 model checksum mismatch");
  if (digest(projector) !== QWEN3_VL_558_CONFIG.projectorSha256) throw new Error("Qwen 558 projector checksum mismatch");
  console.log(JSON.stringify({ preflight: "PASS", fixtures: fixtures.length, fixtureSetSha256: QWEN3_VL_558_CONFIG.fixtureSetSha256, modelSha256: QWEN3_VL_558_CONFIG.modelSha256, projectorSha256: QWEN3_VL_558_CONFIG.projectorSha256, executablePresent: true, inferenceStarted: false }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
