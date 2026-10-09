import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { AcquisitionManifest } from "../../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { LocalReviewManifest } from "../../evaluation/imageModeration/dataset/sexualContentReview.service";
import { ModelQualitySexualContentFixture } from "../../evaluation/imageModeration/dataset/sexualContentBenchmark.types";
import { createOwenElliottXsInput, OWEN_ELLIOTT_XS_ARTIFACT, owenElliottDecisionForNativeClass } from "../../evaluation/imageModeration/owenElliottImageSafetyClassifierXsAdapter";
import { evaluateOwenElliottXs, renderOwenElliottXsMarkdown } from "../../evaluation/imageModeration/owenElliottImageSafetyClassifierXsEvaluation";

const fixture = (id: string, decision: "PASS" | "BLOCK", category: "SUGGESTIVE" | "PORNOGRAPHY" | undefined, context: string): ModelQualitySexualContentFixture => ({ id, description: id, localAsset: `${id}.png`, sourceLabels: [], expectedBySurface: { CREATOR_SERVICE_MEDIA: { decision, categories: category ? [category] : [] } }, requiredCapabilities: ["NSFW"], difficulty: "EASY", contextTags: [context as "PORTRAIT"], coverageClasses: [decision === "PASS" ? "ORDINARY_PORTRAIT_PASS" : "PORNOGRAPHY_BLOCK"], rationale: "synthetic test fixture", provenance: { kind: "INTERNAL", license: "test", referenceNote: "test" }, review: { status: "APPROVED", policyVersion: "test", reviewedAt: "2026-01-01T00:00:00.000Z", reviewer: "POLICY_REVIEW", rationale: "test" } });
const acquisition: AcquisitionManifest = { schemaVersion: "STHN_IMAGE_SEXUAL_ACQUISITION_V1", candidates: ["a", "b", "c"].map((id) => ({ id: `candidate-${id}`, state: "REVIEW_REQUIRED", localAsset: `sthn-sexual-${id}.png`, coverageClass: "ORDINARY_PORTRAIT_PASS", source: { provider: "MANUAL", collectionGroup: id === "a" ? "portraits" : "other" }, acquiredAt: "2026-01-01T00:00:00.000Z" })) };
const reviews: LocalReviewManifest = { schemaVersion: "STHN_IMAGE_SEXUAL_REVIEW_V1", reviews: ["a", "b", "c"].map((id) => ({ candidateId: `candidate-${id}`, fixtureId: `sthn-sexual-${id}`, state: "APPROVED" })) };

test("I4-B1 frozen native mapping and documented pixel layout are deterministic", async () => {
  assert.equal(OWEN_ELLIOTT_XS_ARTIFACT.artifactRevision, "606ad3dfd6a023215e3ab0797040437cc365977b"); assert.equal(OWEN_ELLIOTT_XS_ARTIFACT.sha256, "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689");
  assert.equal(owenElliottDecisionForNativeClass("SFW"), "PASS"); assert.equal(owenElliottDecisionForNativeClass("NSFW"), "BLOCK"); assert.equal(owenElliottDecisionForNativeClass("NSFL"), "BLOCK");
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 7, g: 17, b: 29 } } }).png().toBuffer(); const input = await createOwenElliottXsInput(image);
  assert.equal(input.length, 3 * 224 * 224); assert.equal(input[0], 7); assert.equal(input[224 * 224], 17); assert.equal(input[2 * 224 * 224], 29);
});

test("I4-B1 report uses human labels, native argmax mapping, and slice dimensions without mutation", async () => {
  const calls: string[] = []; const fakeAdapter = { async initialize() { return { inputName: "image", inputType: "float32", inputShape: ["batch_size", 3, 224, 224], outputName: "probabilities", outputType: "float32", outputShape: ["batch_size", 3] }; }, async classify(bytes: Buffer) { calls.push(bytes.toString()); const next = calls.length === 1 ? "SFW" : calls.length === 2 ? "NSFW" : "NSFL"; return { nativeClass: next, decision: next === "SFW" ? "PASS" : "BLOCK", scores: [0, 0, 1] }; } };
  const assets = new Map([["sthn-sexual-a.png", Buffer.from("a")], ["sthn-sexual-b.png", Buffer.from("b")], ["sthn-sexual-c.png", Buffer.from("c")]]); const fs = await import("node:fs/promises");
  // The runner receives a synthetic temp root; no real review manifest or asset is writable in this test.
  const root = await fs.mkdtemp("i4-b1-test-"); try { for (const [name, bytes] of assets) await fs.writeFile(`${root}/${name}`, bytes); const report = await evaluateOwenElliottXs({ fixtures: [fixture("sthn-sexual-a", "PASS", undefined, "PORTRAIT"), fixture("sthn-sexual-b", "BLOCK", "PORNOGRAPHY", "EXPLICIT_BOUNDARY"), fixture("sthn-sexual-c", "PASS", undefined, "FASHION")], acquisition, reviews, assetRoot: root, adapter: fakeAdapter as never, now: (() => { let value = 0; return () => value += 10; })(), generatedAt: "2026-01-01T00:00:00.000Z", runId: "synthetic" }); assert.equal(report.fixtureCount, 3); assert.equal(report.metrics.correct, 2); assert.equal(report.metrics.falsePositive, 1); assert.equal(report.metrics.falseNegative, 0); assert.deepEqual(report.metrics.nativeClassDistribution, { NSFL: 1, NSFW: 1, SFW: 1 }); assert.equal(report.metrics.byHumanClassification.PASS.total, 2); assert.equal(report.metrics.byCategory.PORNOGRAPHY.total, 1); assert.equal(report.metrics.byContext.PORTRAIT.total, 1); assert.equal(report.metrics.byCollectionGroup.portraits.total, 1); assert.match(renderOwenElliottXsMarkdown(report), /OWEN_ELLIOTT_XS_BASELINE_V1/); assert.equal(calls.length, 3); } finally { await fs.rm(root, { recursive: true, force: true }); }
});
