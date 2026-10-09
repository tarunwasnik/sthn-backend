import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  calculateTextModerationMetrics,
  evaluateTextModerationFixtures,
  validateTextModerationFixtures,
} from "../../evaluation/textModeration/textModerationEvaluation.service";
import { textModerationEvaluationFixtures } from "../../evaluation/textModeration/textModerationFixtures";
import { DeterministicMockTextModerationProvider } from "../../evaluation/textModeration/textModerationMockProvider";
import {
  renderTextModerationMarkdownReport,
  writeTextModerationEvaluationReport,
} from "../../evaluation/textModeration/textModerationReport.service";
import {
  FixtureEvaluationResult,
  OTHER_INAPPROPRIATE_POLICY_BOUNDARY,
  PROFANITY_POLICY_BOUNDARY,
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "../../evaluation/textModeration/textModerationEvaluation.types";

const fixture = (overrides: Partial<TextModerationEvaluationFixture> = {}): TextModerationEvaluationFixture => ({
  id: "test-fixture-001",
  domain: "USER_PROFILE",
  target: "bio",
  text: "Synthetic text",
  expectedDecision: "ALLOW",
  policyReason: "Synthetic unit-test reason.",
  language: "en",
  difficulty: "EASY",
  tags: ["profile"],
  ...overrides,
});

test("fixture dataset is valid, unique, bounded to approved domains and targets", () => {
  assert.doesNotThrow(() => validateTextModerationFixtures(textModerationEvaluationFixtures));
  assert.equal(new Set(textModerationEvaluationFixtures.map(({ id }) => id)).size, textModerationEvaluationFixtures.length);
  assert.equal(textModerationEvaluationFixtures.length, 140);
  assert.deepEqual(
    textModerationEvaluationFixtures.map(({ id }) => id),
    Array.from({ length: 140 }, (_, index) => `sthn-tm-${String(index + 1).padStart(3, "0")}`),
  );
  for (const item of textModerationEvaluationFixtures) {
    if (item.domain === "USER_PROFILE") assert.match(item.target, /^(bio|interests\[\d+\])$/);
    else assert.match(item.target, /^(publicBio|services\[\d+\])$/);
  }
});

test("reviewed fixture keeps its stable ID and is classified as abusive or harassing", () => {
  const corrected = textModerationEvaluationFixtures.find(({ id }) => id === "sthn-tm-073");
  assert.equal(corrected?.text, "You are a disgusting piece of trash; I hope everyone humiliates you.");
  assert.equal(corrected?.expectedDecision, "BLOCK");
  assert.equal(corrected?.expectedCategory, "ABUSIVE_OR_HARASSING");
});

test("profanity policy includes genuine BLOCK expression and benign discussion ALLOW fixtures", () => {
  assert.match(PROFANITY_POLICY_BOUNDARY.block, /own public expression/);
  assert.match(PROFANITY_POLICY_BOUNDARY.allow, /educational/);
  const profanity = textModerationEvaluationFixtures.filter(({ tags }) => tags.includes("profanity"));
  const directBlocks = profanity.filter(({ expectedDecision, expectedCategory }) => expectedDecision === "BLOCK" && expectedCategory === "PROFANITY");
  const benignAllows = profanity.filter(({ expectedDecision, tags }) => expectedDecision === "ALLOW" && tags.includes("benign-sensitive-context"));
  assert.equal(directBlocks.length, 4);
  assert.ok(benignAllows.length >= 4);
  assert.ok(directBlocks.some(({ domain, target }) => domain === "USER_PROFILE" && target === "bio"));
  assert.ok(directBlocks.some(({ domain, target }) => domain === "CREATOR_APPLICATION" && target === "publicBio"));
  assert.ok(directBlocks.some(({ domain, target }) => domain === "CREATOR_APPLICATION" && target.startsWith("services[")));
});

test("deliberate near-pair groups each contain one ALLOW and one BLOCK", () => {
  const groups = new Map<string, TextModerationEvaluationFixture[]>();
  for (const item of textModerationEvaluationFixtures) {
    if (item.nearPairGroup) groups.set(item.nearPairGroup, [...(groups.get(item.nearPairGroup) ?? []), item]);
  }
  assert.equal(groups.size, 8);
  for (const [name, pair] of groups) {
    assert.equal(pair.length, 2, `${name} must contain exactly two fixtures`);
    assert.deepEqual(pair.map(({ expectedDecision }) => expectedDecision).sort(), ["ALLOW", "BLOCK"]);
  }
});

test("OTHER_INAPPROPRIATE stays a bounded BLOCK category for clear marketplace incompatibility", () => {
  assert.match(OTHER_INAPPROPRIATE_POLICY_BOUNDARY, /not adequately represented by another bounded Text AI harm category/);
  const fixtures = textModerationEvaluationFixtures.filter(({ expectedCategory }) => expectedCategory === "OTHER_INAPPROPRIATE");
  assert.ok(fixtures.length > 0);
  for (const item of fixtures) {
    assert.equal(item.expectedDecision, "BLOCK");
    assert.ok(item.tags.some((tag) => ["marketplace", "harassment", "threat", "violence"].includes(tag)));
    assert.equal(item.tags.includes("benign-sensitive-context"), false);
  }
});

test("dataset covers decisions, difficulties, canonical categories, marketplace context, and adversarial inputs", () => {
  const values = <T>(selector: (item: TextModerationEvaluationFixture) => T) => new Set(textModerationEvaluationFixtures.map(selector));
  assert.deepEqual([...values(({ expectedDecision }) => expectedDecision)].sort(), ["ALLOW", "BLOCK"]);
  assert.deepEqual([...values(({ difficulty }) => difficulty)].sort(), ["ADVERSARIAL", "CONTEXTUAL", "EASY"]);
  const categories = [...values(({ expectedCategory }) => expectedCategory)].filter(
    (category): category is NonNullable<typeof category> => category !== undefined,
  ).sort();
  assert.deepEqual(categories, [
    "ABUSIVE_OR_HARASSING", "HATE", "OTHER_INAPPROPRIATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE",
  ]);
  assert.ok(textModerationEvaluationFixtures.some(({ tags }) => tags.includes("marketplace")));
  assert.ok(textModerationEvaluationFixtures.some(({ tags }) => tags.includes("benign-sensitive-context")));
  assert.ok(textModerationEvaluationFixtures.some(({ tags }) => tags.includes("obfuscation")));
});

test("multilingual and Unicode fixture text survives loading unchanged", () => {
  const hindi = textModerationEvaluationFixtures.find(({ text }) => text === "मैं संगीत, किताबें और पहाड़ों की यात्रा पसंद करता हूँ।");
  const thai = textModerationEvaluationFixtures.find(({ text }) => text === "ชอบดูหนัง ฟังเพลง และเดินทางกับเพื่อน");
  const zeroWidth = textModerationEvaluationFixtures.find(({ text }) => text.includes("\u200b"));
  assert.equal(hindi?.language, "hi");
  assert.equal(thai?.language, "th");
  assert.ok(zeroWidth?.tags.includes("unicode"));
});

test("validator rejects duplicate IDs, unsupported target/domain combinations, and BLOCK without category", () => {
  assert.throws(() => validateTextModerationFixtures([fixture(), fixture()]), /Duplicate/);
  assert.throws(() => validateTextModerationFixtures([fixture({ target: "services[0]" })]), /not allowed/);
  assert.throws(() => validateTextModerationFixtures([fixture({ expectedDecision: "BLOCK" })]), /needs a category/);
});

test("deterministic mock evaluates every fixture and exercises FP, FN, unavailable, error, latency, and breakdowns", async () => {
  let tick = 0;
  const report = await evaluateTextModerationFixtures(
    textModerationEvaluationFixtures,
    new DeterministicMockTextModerationProvider(),
    { now: () => tick++, generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  assert.equal(report.results.length, textModerationEvaluationFixtures.length);
  assert.equal(report.metrics.total, textModerationEvaluationFixtures.length);
  assert.ok(report.metrics.correct > 0);
  assert.ok(report.metrics.falsePositive > 0);
  assert.ok(report.metrics.falseNegative > 0);
  assert.ok(report.metrics.unavailable > 0);
  assert.ok(report.metrics.error > 0);
  assert.equal(report.metrics.averageLatencyMs, 1);
  assert.ok(report.metrics.byDifficulty.ADVERSARIAL.total > 0);
  assert.ok(report.metrics.byLanguage.hi.total > 0);
  assert.ok(report.metrics.byTag.marketplace.total > 0);
  assert.ok(report.metrics.byExpectedCategory.SEXUAL.total > 0);
});

test("provider failures are excluded from evaluated accuracy and cannot count as success", async () => {
  const unavailableProvider: TextModerationEvaluationProvider = {
    id: "unavailable-test", displayName: "Unavailable test",
    evaluate: async () => ({ status: "UNAVAILABLE", errorCode: "TEST_UNAVAILABLE" }),
  };
  const report = await evaluateTextModerationFixtures(
    [fixture()], unavailableProvider, { now: () => 10, generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  assert.equal(report.metrics.correct, 0);
  assert.equal(report.metrics.evaluated, 0);
  assert.equal(report.metrics.evaluatedAccuracy, null);
  assert.equal(report.metrics.availabilityRate, 0);
  assert.equal(report.unavailableOrErrors.length, 1);
});

test("raw provider details are bounded and sensitive metadata keys are discarded", async () => {
  const provider: TextModerationEvaluationProvider = {
    id: "raw-boundary-test", displayName: "Raw boundary test",
    evaluate: async () => ({
      status: "COMPLETED", decision: "ALLOW",
      raw: {
        summary: "x".repeat(800),
        labels: Array.from({ length: 25 }, (_, index) => ({ name: `label-${index}`, score: index / 10 })),
        metadata: { authorization: "Bearer forbidden", apiKey: "forbidden", safe: "y".repeat(500) },
      },
    }),
  };
  const report = await evaluateTextModerationFixtures([fixture()], provider);
  const raw = report.results[0].raw;
  assert.equal(raw?.summary?.length, 500);
  assert.equal(raw?.labels?.length, 20);
  assert.deepEqual(Object.keys(raw?.metadata ?? {}), ["safe"]);
  assert.equal(raw?.metadata?.safe?.toString().length, 300);
});

test("metric classification identifies exact false positives and false negatives deterministically", () => {
  const results: FixtureEvaluationResult[] = [
    { fixture: fixture({ id: "allow-001" }), providerStatus: "COMPLETED", providerDecision: "BLOCK", providerCategories: ["OTHER_INAPPROPRIATE"], raw: null, errorCode: null, outcome: "FALSE_POSITIVE", latencyMs: 2 },
    { fixture: fixture({ id: "block-001", expectedDecision: "BLOCK", expectedCategory: "SEXUAL" }), providerStatus: "COMPLETED", providerDecision: "ALLOW", providerCategories: [], raw: null, errorCode: null, outcome: "FALSE_NEGATIVE", latencyMs: 4 },
  ];
  const first = calculateTextModerationMetrics(results);
  const second = calculateTextModerationMetrics(results);
  assert.deepEqual(first, second);
  assert.equal(first.falsePositive, 1);
  assert.equal(first.falseNegative, 1);
  assert.equal(first.evaluatedAccuracy, 0);
  assert.equal(first.averageLatencyMs, 3);
});

test("JSON and Markdown reports are generated with inspectable FP/FN sections", async () => {
  const report = await evaluateTextModerationFixtures(
    textModerationEvaluationFixtures,
    new DeterministicMockTextModerationProvider(),
    { now: () => 1, generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const markdown = renderTextModerationMarkdownReport(report);
  assert.match(markdown, /## False positives/);
  assert.match(markdown, /## False negatives/);
  assert.match(markdown, /STHN reason/);
  const directory = await mkdtemp(path.join(os.tmpdir(), "sthn-t6a1-"));
  const paths = await writeTextModerationEvaluationReport(report, directory);
  assert.equal(JSON.parse(await readFile(paths.jsonPath, "utf8")).schemaVersion, "STHN_TEXT_MODERATION_EVALUATION_V1");
  assert.match(await readFile(paths.markdownPath, "utf8"), /STHN Text Moderation Evaluation/);
});

test("evaluation source remains isolated from production T3A authority", async () => {
  const evaluationDirectory = path.resolve(__dirname, "../../evaluation/textModeration");
  const files = [
    "textModerationEvaluation.types.ts", "textModerationFixtures.ts",
    "textModerationMockProvider.ts", "textModerationEvaluation.service.ts",
    "textModerationReport.service.ts",
  ];
  for (const file of files) {
    const source = await readFile(path.join(evaluationDirectory, file), "utf8");
    assert.doesNotMatch(source, /services[\\/]textModeration|textModerationAdmission|moderateText\s*\(/);
  }
  const script = await readFile(path.resolve(__dirname, "../../scripts/evaluateTextModeration.ts"), "utf8");
  assert.doesNotMatch(script, /services[\\/]textModeration|textModerationAdmission|moderateText\s*\(/);
});
