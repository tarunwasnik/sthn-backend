import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ImageModerationEvaluationDetector, ImageModerationEvaluationFixture } from "../../evaluation/imageModeration/imageModerationEvaluation.types";
import { Qwen3VlOfflineEvaluationAdapter, Qwen3VlOfflineEvaluationConfig, Qwen3VlOfflineRuntime, QWEN3_VL_EVALUATION_JSON_SCHEMA, QWEN3_VL_EVALUATION_OUTPUT_SCHEMA, QWEN3_VL_PROMPT_TEMPLATE, QWEN3_VL_SEXUAL_CONTENT_EVALUATION_POLICY, parseQwen3VlEvaluationOutput, validateQwen3VlOfflineEvaluationConfig, writeQwen3VlRawOutputArtifacts } from "../../evaluation/imageModeration/qwen3VlOfflineEvaluation";
import { sexualContentModelQualityFixtures } from "../../evaluation/imageModeration/dataset/sexualContentBenchmark.fixtures";

const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const fixture: ImageModerationEvaluationFixture = { id: "sthn-qwen-test", description: "Synthetic test fixture.", asset: "synthetic-neutral.svg", expectedBySurface: { USER_PROFILE_PHOTO: { decision: "PASS", categories: [] } }, requiredCapabilities: ["NSFW"], difficulty: "EASY", tags: ["synthetic", "safe-harness"], rationale: "Test only.", provenance: { kind: "SYNTHETIC" } };

class FakeQwenRuntime implements Qwen3VlOfflineRuntime {
  public readonly identity = "fake-qwen-runtime";
  public readonly version = "test-v1";
  public initializeCalls = 0;
  public evaluateCalls = 0;
  public constructor(private readonly result: Awaited<ReturnType<Qwen3VlOfflineRuntime["evaluate"]>> | Error) {}
  public async initialize(input: Parameters<Qwen3VlOfflineRuntime["initialize"]>[0]) { this.initializeCalls += 1; assert.equal(input.temperature, 0); assert.match(input.prompt, /ordinary portraits/i); }
  public async evaluate(input: Parameters<Qwen3VlOfflineRuntime["evaluate"]>[0]) { this.evaluateCalls += 1; assert.equal(input.temperature, 0); if (this.result instanceof Error) throw this.result; return this.result; }
}

const withArtifacts = async (callback: (config: Qwen3VlOfflineEvaluationConfig) => Promise<void>) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sthn-qwen-v2a-"));
  try {
    const model = Buffer.from("synthetic-qwen-model"); const projector = Buffer.from("synthetic-qwen-projector");
    const modelPath = path.join(directory, "model.gguf"); const projectorPath = path.join(directory, "mmproj.gguf");
    await Promise.all([writeFile(modelPath, model), writeFile(projectorPath, projector)]);
    await callback({ model: { path: modelPath, sha256: digest(model) }, multimodalProjector: { path: projectorPath, sha256: digest(projector) }, modelId: "Qwen/Qwen3-VL-2B-Instruct-GGUF", revision: "immutable-test-revision", maxOutputTokens: 160 });
  } finally { await rm(directory, { recursive: true, force: true }); }
};

test("Qwen V2-A validates verified local artifacts and rejects remote, missing, mismatched, and shared artifacts", async () => {
  await withArtifacts(async (config) => {
    const result = await validateQwen3VlOfflineEvaluationConfig(config); assert.ok(path.isAbsolute(result.modelPath));
    await assert.rejects(validateQwen3VlOfflineEvaluationConfig({ ...config, model: { ...config.model, path: "https://example.invalid/model.gguf" } }), /local filesystem/);
    await assert.rejects(validateQwen3VlOfflineEvaluationConfig({ ...config, model: { ...config.model, sha256: "0".repeat(64) } }), /checksum mismatch/);
    await assert.rejects(validateQwen3VlOfflineEvaluationConfig({ ...config, multimodalProjector: { ...config.model } }), /distinct/);
    await assert.rejects(validateQwen3VlOfflineEvaluationConfig({ ...config, multimodalProjector: { ...config.multimodalProjector, path: path.join(path.dirname(config.model.path), "missing.gguf") } }), /missing/);
  });
});

test("Qwen V2 constrained schema uses mutually exclusive decision/category branches", () => {
  assert.equal(QWEN3_VL_EVALUATION_OUTPUT_SCHEMA.id, "STHN_QWEN3_VL_SEXUAL_CONTENT_OUTPUT_SCHEMA_V2");
  assert.equal(QWEN3_VL_EVALUATION_JSON_SCHEMA.oneOf.length, 3);
  const branches = QWEN3_VL_EVALUATION_JSON_SCHEMA.oneOf;
  assert.deepEqual(branches.map((branch) => branch.properties.decision.const), ["PASS", "BLOCK", "UNCERTAIN"]);
  assert.deepEqual(branches.map((branch) => [branch.properties.categories.minItems, branch.properties.categories.maxItems]), [[0, 0], [1, 4], [1, 4]]);
  assert.ok(branches.every((branch) => branch.additionalProperties === false && branch.required.join("|") === "decision|categories|reason"));
});

test("Qwen strict schema accepts PASS, BLOCK, and UNCERTAIN while rejecting every invalid decision/category contract", () => {
  assert.match(QWEN3_VL_PROMPT_TEMPLATE.text, /PASS requires categories to be exactly \[\]/);
  assert.match(QWEN3_VL_PROMPT_TEMPLATE.text, /BLOCK or UNCERTAIN requires one or more allowed categories/);
  assert.deepEqual(parseQwen3VlEvaluationOutput('{"decision":"PASS","categories":[],"reason":"Ordinary visible portrait."}').decision, "PASS");
  assert.deepEqual(parseQwen3VlEvaluationOutput('{"decision":"BLOCK","categories":["PORNOGRAPHY"],"reason":"Visible explicit sexual content."}').categories, ["PORNOGRAPHY"]);
  assert.equal(parseQwen3VlEvaluationOutput('{"decision":"UNCERTAIN","categories":["SUGGESTIVE"],"reason":"Visible evidence is insufficient."}').decision, "UNCERTAIN");
  assert.throws(() => parseQwen3VlEvaluationOutput("not json"), /INVALID_JSON/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"BLOCK","categories":["NOT_ALLOWED"],"reason":"x"}'), /CATEGORY_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"PASS","categories":[],"reason":"x","extra":true}'), /SCHEMA_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"PASS","categories":["PORNOGRAPHY"],"reason":"x"}'), /CATEGORY_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"BLOCK","categories":[],"reason":"x"}'), /CATEGORY_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"UNCERTAIN","categories":[],"reason":"x"}'), /CATEGORY_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"UNKNOWN","categories":[],"reason":"x"}'), /SCHEMA_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"PASS","categories":[]}'), /SCHEMA_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"PASS","categories":[],"reason":"   "}'), /REASON_INVALID/);
  assert.throws(() => parseQwen3VlEvaluationOutput('{"decision":"BLOCK","categories":["PORNOGRAPHY","PORNOGRAPHY"],"reason":"x"}'), /CATEGORY_INVALID/);
});

test("Qwen adapter maps fake runtime output once, has no fallback, and records bounded evaluation-only evidence", async () => {
  await withArtifacts(async (config) => {
    const runtime = new FakeQwenRuntime({ status: "COMPLETED", rawOutput: '{"decision":"BLOCK","categories":["SEXUAL_CONTENT"],"reason":"Visible explicit sexual activity."}' });
    const adapter = new Qwen3VlOfflineEvaluationAdapter(config, runtime);
    const detector: ImageModerationEvaluationDetector = adapter;
    assert.equal(detector.id, "qwen3-vl-2b-instruct-offline-evaluation");
    const result = await adapter.evaluate({ fixture, surface: "USER_PROFILE_PHOTO", assetPath: "synthetic-neutral.svg", bytes: Buffer.from("synthetic") });
    assert.deepEqual(result, { status: "COMPLETED", decision: "BLOCK", findings: [{ category: "SEXUAL_CONTENT" }] });
    assert.equal(runtime.initializeCalls, 1); assert.equal(runtime.evaluateCalls, 1);
    assert.equal(adapter.getEvaluationRecords()[0].schemaValid, true);
    assert.equal(adapter.getCandidateMetadata().policyId, QWEN3_VL_SEXUAL_CONTENT_EVALUATION_POLICY.id);
    assert.equal(adapter.getCandidateMetadata().promptTemplateId, QWEN3_VL_PROMPT_TEMPLATE.id);
    assert.equal(adapter.getCandidateMetadata().outputSchemaId, QWEN3_VL_EVALUATION_OUTPUT_SCHEMA.id);
  });
});

test("Qwen adapter preserves unavailable and runtime/schema errors without retrying or producing PASS", async () => {
  await withArtifacts(async (config) => {
    const unavailableRuntime = new FakeQwenRuntime({ status: "UNAVAILABLE", errorCode: "LOCAL_RUNTIME_UNAVAILABLE" });
    const unavailable = new Qwen3VlOfflineEvaluationAdapter(config, unavailableRuntime);
    assert.deepEqual(await unavailable.evaluate({ fixture, surface: "USER_PROFILE_PHOTO", assetPath: "safe.svg", bytes: Buffer.from("x") }), { status: "UNAVAILABLE", errorCode: "LOCAL_RUNTIME_UNAVAILABLE" });
    assert.equal(unavailableRuntime.evaluateCalls, 1);
    const malformedRuntime = new FakeQwenRuntime({ status: "COMPLETED", rawOutput: "[]" });
    const malformed = new Qwen3VlOfflineEvaluationAdapter(config, malformedRuntime);
    assert.deepEqual(await malformed.evaluate({ fixture, surface: "USER_PROFILE_PHOTO", assetPath: "safe.svg", bytes: Buffer.from("x") }), { status: "ERROR", errorCode: "QWEN_OUTPUT_SCHEMA_INVALID" });
    assert.equal(malformedRuntime.evaluateCalls, 1);
    const throwingRuntime = new FakeQwenRuntime(new Error("runtime failed"));
    const throwing = new Qwen3VlOfflineEvaluationAdapter(config, throwingRuntime);
    assert.deepEqual(await throwing.evaluate({ fixture, surface: "USER_PROFILE_PHOTO", assetPath: "safe.svg", bytes: Buffer.from("x") }), { status: "ERROR", errorCode: "QWEN_RUNTIME_EXECUTION_ERROR" });
  });
});

test("raw model output writer is constrained to ignored evaluation output and frozen labels are not mutated", async () => {
  const before = JSON.stringify(sexualContentModelQualityFixtures);
  await withArtifacts(async (config) => {
    const adapter = new Qwen3VlOfflineEvaluationAdapter(config, new FakeQwenRuntime({ status: "COMPLETED", rawOutput: '{"decision":"PASS","categories":[],"reason":"Ordinary photograph."}' }));
    await adapter.evaluate({ fixture, surface: "USER_PROFILE_PHOTO", assetPath: "safe.svg", bytes: Buffer.from("x") });
    await assert.rejects(writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), path.join(os.tmpdir(), "outside-evaluation-output")), /evaluation-output/);
    const outputDirectory = path.resolve(process.cwd(), "evaluation-output", "image-moderation", `qwen-v2a-test-${Date.now()}`);
    try {
      const outputs = await writeQwen3VlRawOutputArtifacts(adapter.getEvaluationRecords(), outputDirectory);
      assert.equal(outputs.length, 1);
      assert.match(await readFile(outputs[0], "utf8"), /Ordinary photograph/);
    } finally { await rm(outputDirectory, { recursive: true, force: true }); }
  });
  assert.equal(JSON.stringify(sexualContentModelQualityFixtures), before);
});
