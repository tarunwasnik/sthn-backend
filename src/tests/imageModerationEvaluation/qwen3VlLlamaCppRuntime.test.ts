import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { Qwen3VlOfflineEvaluationAdapter, Qwen3VlOfflineEvaluationConfig, QWEN3_VL_EVALUATION_JSON_SCHEMA, QWEN3_VL_PROMPT_TEMPLATE, QWEN3_VL_SEXUAL_CONTENT_EVALUATION_POLICY } from "../../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { LocalProcessResult, prepareQwen3VlEvaluationImage, Qwen3VlLlamaCppRuntime } from "../../evaluation/imageModeration/qwen3VlLlamaCppRuntime";

const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const prompt = "Evaluation prompt";

const withFiles = async (callback: (input: Readonly<{ config: Qwen3VlOfflineEvaluationConfig; executablePath: string }>) => Promise<void>) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sthn-qwen-runtime-test-"));
  try {
    const model = Buffer.from("model"); const projector = Buffer.from("projector"); const executable = Buffer.from("test executable");
    const modelPath = path.join(directory, "model.gguf"); const projectorPath = path.join(directory, "mmproj.gguf"); const executablePath = path.join(directory, "llama-mtmd-cli.exe");
    await Promise.all([writeFile(modelPath, model), writeFile(projectorPath, projector), writeFile(executablePath, executable)]);
    await callback({ config: { model: { path: modelPath, sha256: digest(model) }, multimodalProjector: { path: projectorPath, sha256: digest(projector) }, modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF", revision: "52d6c8ffea26cc873ac5ad116f8631268d7eb503", maxOutputTokens: 160 }, executablePath });
  } finally { await rm(directory, { recursive: true, force: true }); }
};

test("llama.cpp runtime passes only local model/projector/image arguments and cleans its owned temporary image", async () => {
  await withFiles(async ({ config, executablePath }) => {
    let inferenceArgs: readonly string[] = []; let observedImagePath = "";
    const source = await sharp({ create: { width: 2048, height: 1024, channels: 3, background: "#2876d3" } }).png().toBuffer();
    const runner = async (_executable: string, args: readonly string[]): Promise<LocalProcessResult> => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "", stderr: "version: 8074 (d23a55997)", timedOut: false, spawnError: false };
      inferenceArgs = args; observedImagePath = args[args.indexOf("--image") + 1];
      const metadata = await sharp(await readFile(observedImagePath)).metadata();
      assert.equal(metadata.width, 1024); assert.equal(metadata.height, 512);
      return { exitCode: 0, stdout: "", stderr: '{"decision":"PASS","categories":[],"reason":"Visible simple synthetic image."}', timedOut: false, spawnError: false };
    };
    const runtime = new Qwen3VlLlamaCppRuntime({ executablePath, buildId: "b8074", commandTimeoutMs: 10_000, contextSize: 4096 }, runner);
    const adapter = new Qwen3VlOfflineEvaluationAdapter(config, runtime);
    const result = await adapter.evaluate({ fixture: { id: "sthn-qwen-runtime", description: "Synthetic test.", asset: "safe.png", expectedBySurface: { USER_PROFILE_PHOTO: { decision: "PASS", categories: [] } }, requiredCapabilities: ["NSFW"], difficulty: "EASY", tags: ["synthetic", "safe-harness"], rationale: "Test.", provenance: { kind: "SYNTHETIC" } }, surface: "USER_PROFILE_PHOTO", assetPath: "safe.png", bytes: source });
    assert.equal(result.status, "COMPLETED");
    assert.deepEqual(inferenceArgs.slice(0, 8), ["-m", config.model.path, "--mmproj", config.multimodalProjector.path, "--image", observedImagePath, "-p", QWEN3_VL_PROMPT_TEMPLATE.text.replace("{{policyId}}", QWEN3_VL_SEXUAL_CONTENT_EVALUATION_POLICY.id)]);
    assert.ok(inferenceArgs.includes("--temp") && inferenceArgs[inferenceArgs.indexOf("--temp") + 1] === "0");
    assert.ok(inferenceArgs.includes("--jinja"));
    assert.ok(inferenceArgs.includes("-n") && inferenceArgs[inferenceArgs.indexOf("-n") + 1] === "160");
    assert.equal(inferenceArgs[inferenceArgs.indexOf("--json-schema") + 1], JSON.stringify(QWEN3_VL_EVALUATION_JSON_SCHEMA));
    assert.match(inferenceArgs[inferenceArgs.indexOf("--log-file") + 1], /llama-mtmd\.log$/);
    await assert.rejects(access(observedImagePath));
    assert.equal(adapter.getEvaluationRecords()[0].performance?.inferenceLatencyMs !== undefined, true);
    assert.deepEqual(adapter.getEvaluationRecords()[0].imagePreparation && { originalWidth: adapter.getEvaluationRecords()[0].imagePreparation?.originalWidth, originalHeight: adapter.getEvaluationRecords()[0].imagePreparation?.originalHeight, width: adapter.getEvaluationRecords()[0].imagePreparation?.width, height: adapter.getEvaluationRecords()[0].imagePreparation?.height }, { originalWidth: 2048, originalHeight: 1024, width: 1024, height: 512 });
  });
});

test("Qwen evaluation derivative preserves aspect ratio, applies orientation, and never upscales", async () => {
  const oriented = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#d34d28" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const derivative = await prepareQwen3VlEvaluationImage(oriented);
  assert.deepEqual({ originalWidth: derivative.metadata.originalWidth, originalHeight: derivative.metadata.originalHeight, width: derivative.metadata.width, height: derivative.metadata.height }, { originalWidth: 3000, originalHeight: 1000, width: 341, height: 1024 });
  const small = await prepareQwen3VlEvaluationImage(await sharp({ create: { width: 200, height: 100, channels: 3, background: "#2876d3" } }).png().toBuffer());
  assert.deepEqual({ width: small.metadata.width, height: small.metadata.height }, { width: 200, height: 100 });
});

test("llama.cpp runtime maps timeout, nonzero exit, and unavailable executable without retry or fallback", async () => {
  await withFiles(async ({ config, executablePath }) => {
    const source = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#2876d3" } }).png().toBuffer();
    const evaluate = async (result: LocalProcessResult) => {
      let calls = 0;
      const runtime = new Qwen3VlLlamaCppRuntime({ executablePath, buildId: "b8074", commandTimeoutMs: 10_000, contextSize: 4096 }, async (_exe, args) => { calls += 1; return args[0] === "--version" ? { exitCode: 0, stdout: "version: 8074", stderr: "", timedOut: false, spawnError: false } : result; });
      await runtime.initialize({ modelPath: config.model.path, multimodalProjectorPath: config.multimodalProjector.path, prompt, temperature: 0, maxOutputTokens: 160 });
      const response = await runtime.evaluate({ bytes: source, prompt, temperature: 0, maxOutputTokens: 160 });
      assert.equal(calls, 2); return response;
    };
    assert.deepEqual(await evaluate({ exitCode: null, stdout: "", stderr: "", timedOut: true, spawnError: false }), { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_TIMEOUT" });
    assert.deepEqual(await evaluate({ exitCode: 2, stdout: "", stderr: "bad args", timedOut: false, spawnError: false }), { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_NONZERO_EXIT" });
    const missing = new Qwen3VlLlamaCppRuntime({ executablePath: path.join(path.dirname(executablePath), "missing.exe"), buildId: "b8074", commandTimeoutMs: 10_000, contextSize: 4096 });
    await missing.initialize({ modelPath: config.model.path, multimodalProjectorPath: config.multimodalProjector.path, prompt, temperature: 0, maxOutputTokens: 160 });
    assert.deepEqual(await missing.evaluate({ bytes: source, prompt, temperature: 0, maxOutputTokens: 160 }), { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_UNAVAILABLE" });
  });
});
