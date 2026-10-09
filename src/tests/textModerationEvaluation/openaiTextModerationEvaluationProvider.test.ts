import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { evaluateTextModerationFixtures } from "../../evaluation/textModeration/textModerationEvaluation.service";
import { TEXT_MODERATION_FIXTURE_VERSION, textModerationEvaluationFixtures } from "../../evaluation/textModeration/textModerationFixtures";
import {
  OPENAI_MODERATION_ENDPOINT,
  OPENAI_MODERATION_MODEL,
  openAIApiKeyFromEnvironment,
  OpenAITextModerationEvaluationProvider,
  OpenAITextModerationEvaluationProviderOptions,
} from "../../evaluation/textModeration/providers/openaiTextModerationEvaluationProvider";
import {
  renderTextModerationMarkdownReport,
  writeTextModerationEvaluationReport,
} from "../../evaluation/textModeration/textModerationReport.service";

const TEST_API_KEY = "synthetic-unit-test-credential";
const firstFixture = textModerationEvaluationFixtures[0];

const moderationBody = (flagged: boolean) => ({
  id: "modr_synthetic_test",
  model: "omni-moderation-2024-09-26",
  results: [{
    flagged,
    categories: { harassment: flagged, illicit: null, sexual: false },
    category_scores: { harassment: flagged ? 0.95 : 0.05, illicit: 0.01, sexual: 0.001 },
    category_applied_input_types: { harassment: ["text"], illicit: ["text"], sexual: ["text", "image"] },
  }],
});

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const provider = (
  fetchImplementation: typeof fetch,
  overrides: Partial<OpenAITextModerationEvaluationProviderOptions> = {},
) => new OpenAITextModerationEvaluationProvider({
  apiKey: TEST_API_KEY,
  fetchImplementation,
  sleepImplementation: async () => undefined,
  ...overrides,
});

test("flagged=true maps only to BLOCK and preserves native OpenAI response evidence", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const result = await provider(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse(200, moderationBody(true));
  }).evaluate(firstFixture);
  assert.equal(capturedUrl, OPENAI_MODERATION_ENDPOINT);
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { model: OPENAI_MODERATION_MODEL, input: firstFixture.text });
  assert.equal(result.status, "COMPLETED");
  if (result.status !== "COMPLETED") return;
  assert.equal(result.decision, "BLOCK");
  assert.equal(result.raw?.metadata?.requestedModel, OPENAI_MODERATION_MODEL);
  assert.equal(result.raw?.metadata?.actualModel, "omni-moderation-2024-09-26");
  assert.equal(result.raw?.metadata?.requestId, "modr_synthetic_test");
  assert.equal(result.raw?.metadata?.overallFlagged, true);
  assert.deepEqual(result.raw?.labels?.find(({ name }) => name === "harassment"), {
    name: "harassment", flagged: true, score: 0.95, appliedInputTypes: ["text"],
  });
  assert.equal(result.raw?.labels?.find(({ name }) => name === "illicit")?.flagged, null);
});

test("flagged=false maps only to ALLOW and sends frozen Unicode text unchanged", async () => {
  const unicodeFixture = textModerationEvaluationFixtures.find(({ tags }) => tags.includes("unicode"));
  assert.ok(unicodeFixture);
  let inputText = "";
  const result = await provider(async (_input, init) => {
    inputText = (JSON.parse(String(init?.body)) as { input: string }).input;
    return jsonResponse(200, moderationBody(false));
  }).evaluate(unicodeFixture);
  assert.equal(result.status, "COMPLETED");
  if (result.status === "COMPLETED") assert.equal(result.decision, "ALLOW");
  assert.equal(inputText, unicodeFixture.text);
});

test("malformed JSON and unexpected response shapes are ERROR, never ALLOW", async () => {
  const malformed = await provider(async () => new Response("not-json", { status: 200 })).evaluate(firstFixture);
  assert.equal(malformed.status, "ERROR");
  if (malformed.status === "ERROR") assert.equal(malformed.errorCode, "OPENAI_MALFORMED_RESPONSE");
  const unexpected = await provider(async () => jsonResponse(200, { id: "modr", model: "model", results: [] })).evaluate(firstFixture);
  assert.equal(unexpected.status, "ERROR");
  if (unexpected.status === "ERROR") assert.equal(unexpected.errorCode, "OPENAI_UNEXPECTED_RESPONSE");
});

test("timeout becomes bounded UNAVAILABLE rather than ALLOW", async () => {
  let calls = 0;
  const hangingFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  }) as typeof fetch;
  const result = await provider(hangingFetch, { timeoutMs: 5, maxAttempts: 1 }).evaluate(firstFixture);
  assert.equal(calls, 1);
  assert.equal(result.status, "UNAVAILABLE");
  if (result.status === "UNAVAILABLE") assert.equal(result.errorCode, "OPENAI_TIMEOUT");
});

test("401 is a non-retried ERROR and does not expose the API key", async () => {
  let calls = 0;
  const result = await provider(async () => {
    calls += 1;
    return jsonResponse(401, { error: { message: `Never persist ${TEST_API_KEY}` } });
  }).evaluate(firstFixture);
  assert.equal(calls, 1);
  assert.equal(result.status, "ERROR");
  if (result.status === "ERROR") assert.equal(result.errorCode, "OPENAI_AUTHENTICATION_FAILED");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_API_KEY));
});

test("429 and 5xx retries are capped and retain final attempt classification", async () => {
  let rateLimitCalls = 0;
  const rateLimited = await provider(async () => {
    rateLimitCalls += 1;
    return jsonResponse(429, { error: { message: "rate limited" } });
  }).evaluate(firstFixture);
  assert.equal(rateLimitCalls, 3);
  assert.equal(rateLimited.status, "UNAVAILABLE");
  if (rateLimited.status === "UNAVAILABLE") {
    assert.equal(rateLimited.errorCode, "OPENAI_RATE_LIMITED");
    assert.equal(rateLimited.raw?.metadata?.attempts, 3);
  }

  let serverErrorCalls = 0;
  const serverError = await provider(async () => {
    serverErrorCalls += 1;
    return jsonResponse(503, { error: { message: "unavailable" } });
  }, { maxAttempts: 2 }).evaluate(firstFixture);
  assert.equal(serverErrorCalls, 2);
  assert.equal(serverError.status, "UNAVAILABLE");
  if (serverError.status === "UNAVAILABLE") assert.equal(serverError.errorCode, "OPENAI_SERVER_ERROR");
});

test("network failure retries are bounded and never become ALLOW", async () => {
  let calls = 0;
  const result = await provider(async () => {
    calls += 1;
    throw new TypeError("synthetic network interruption");
  }, { maxAttempts: 2 }).evaluate(firstFixture);
  assert.equal(calls, 2);
  assert.equal(result.status, "UNAVAILABLE");
  if (result.status === "UNAVAILABLE") assert.equal(result.errorCode, "OPENAI_NETWORK_ERROR");
});

test("report records requested and actual model without API key or Authorization header", async () => {
  const evaluationProvider = provider(async () => jsonResponse(200, moderationBody(false)));
  const report = await evaluateTextModerationFixtures([firstFixture], evaluationProvider, {
    generatedAt: "2026-09-07T00:00:00.000Z",
    runId: "openai-test-run",
    fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION,
  });
  assert.equal(report.provider.requestedModel, OPENAI_MODERATION_MODEL);
  assert.deepEqual(report.provider.actualModels, ["omni-moderation-2024-09-26"]);
  assert.equal(report.fixture.count, 1);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(TEST_API_KEY));
  assert.doesNotMatch(serialized, /authorization/i);
  const markdown = renderTextModerationMarkdownReport(report);
  assert.match(markdown, /Requested model: omni-moderation-latest/);
  assert.match(markdown, /Actual model\(s\): omni-moderation-2024-09-26/);
  assert.match(markdown, /## Near-pair results/);
  assert.match(markdown, /## Profanity-focused results/);
  assert.match(markdown, /## Multilingual misses and failures/);
  assert.match(markdown, /## Adversarial summary/);
});

test("preserved report output writes immutable run files plus latest files", async () => {
  const report = await evaluateTextModerationFixtures(
    [firstFixture], provider(async () => jsonResponse(200, moderationBody(false))),
    { generatedAt: "2026-09-07T00:00:00.000Z", runId: "openai-test-run", fixtureVersion: TEXT_MODERATION_FIXTURE_VERSION },
  );
  const output = await mkdtemp(path.join(os.tmpdir(), "sthn-t6a2-"));
  const paths = await writeTextModerationEvaluationReport(report, output, { preserveRun: true });
  assert.ok(paths.runJsonPath && paths.runMarkdownPath);
  assert.equal(JSON.parse(await readFile(paths.runJsonPath, "utf8")).runId, "openai-test-run");
  assert.equal(JSON.parse(await readFile(paths.jsonPath, "utf8")).runId, "openai-test-run");
});

test("missing credential fails clearly without fallback and production T3A has no OpenAI evaluation import", async () => {
  assert.throws(() => new OpenAITextModerationEvaluationProvider({ apiKey: " " }), /non-empty OPENAI_API_KEY/);
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(() => openAIApiKeyFromEnvironment(), /not configured/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
  const providerSource = await readFile(path.resolve(__dirname, "../../evaluation/textModeration/providers/openaiTextModerationEvaluationProvider.ts"), "utf8");
  assert.doesNotMatch(providerSource, /services[\\/]textModeration|textModerationAdmission|moderateText\s*\(/);
  for (const relative of [
    "../../services/textModeration/textModerationProviderAdapter.ts",
    "../../services/textModeration/textModeration.service.ts",
    "../../services/textModeration/textModerationAdmission.service.ts",
  ]) {
    const productionSource = await readFile(path.resolve(__dirname, relative), "utf8");
    assert.doesNotMatch(productionSource, /OpenAITextModerationEvaluationProvider|OPENAI_MODERATION_ENDPOINT/);
  }
});
