import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtemp, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { importCandidateBytes, loadManifest } from "../../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { createSexualContentReviewServer } from "../../evaluation/imageModeration/dataset/sexualContentReviewServer";
import { legacyReviewHtml } from "../../evaluation/imageModeration/dataset/sexualContentLegacyReviewUi";
import { reviewHtml } from "../../evaluation/imageModeration/dataset/sexualContentReviewUi";
import { restoreExpectedBySurface, serializeExpectedBySurface } from "../../evaluation/imageModeration/dataset/sexualContentReviewUiState";

test("A6 lightweight navigation lists trusted manifest candidates without asset hydration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "a6-"));
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const candidate = await importCandidateBytes({ root, bytes, coverageClass: "BOUNDARY_UNCERTAIN", source: { provider: "MANUAL", reference: "x.png", collectionGroup: "06_safe_ai_generated" } });
  const manifest = await loadManifest(root); await unlink(path.join(root, candidate.localAsset!));
  const app = await createSexualContentReviewServer({ root, manualBenchmark: false });
  try {
    const constants = await fetch(`${app.url}/api/constants`).then(async (response) => response.json() as Promise<{ contextTags: string[] }>);
    assert.deepEqual(constants.contextTags, ["PORTRAIT", "PROFESSIONAL", "FITNESS", "ATHLETIC", "BEACH", "SWIMWEAR", "SHIRTLESS", "FASHION", "COUPLE", "GROUP", "ANIME", "DRAWING", "AI_GENERATED", "SUGGESTIVE_BOUNDARY", "EXPLICIT_BOUNDARY"]);
    const light = await fetch(`${app.url}/api/candidates?state=REVIEW_REQUIRED&detail=light`);
    assert.equal(light.status, 200); const records = await light.json() as Array<{ id: string; safeMetadata: { collectionGroup?: string } }>;
    assert.equal(records.length, 1); assert.equal(records[0].id, candidate.id); assert.equal(records[0].safeMetadata.collectionGroup, "06_safe_ai_generated");
    const image = await fetch(`${app.url}/api/candidates/${candidate.id}/image`); assert.equal(image.status, 400);
    assert.equal(manifest.candidates[0].sha256, candidate.sha256);
  } finally { await app.close(); }
});

test("A6 optimized UI is image-first, pending-first, and retains explicit review authority", () => {
  assert.match(reviewHtml, /detail=light/); assert.match(reviewHtml, /class="stage"/); assert.match(reviewHtml, /object-fit:contain/);
  assert.match(reviewHtml, /max-width:100%/); assert.match(reviewHtml, /max-height:calc\(100vh - 130px\)/); assert.match(reviewHtml, /overflow:visible/); assert.doesNotMatch(reviewHtml, /object-fit:cover/);
  assert.match(reviewHtml, /Remaining work/); assert.match(reviewHtml, /Approve & Next/); assert.match(reviewHtml, /sessionDecision/);
  assert.match(reviewHtml, /SUGGESTIVE/); assert.match(reviewHtml, /NUDITY/); assert.match(reviewHtml, /SEXUAL_CONTENT/); assert.match(reviewHtml, /PORNOGRAPHY/);
  assert.match(reviewHtml, /Context — explicit human selection/); assert.match(reviewHtml, /Benchmark classification — explicit human selection/);
  assert.match(reviewHtml, /Surface-specific expectations/); assert.match(reviewHtml, /ctrlKey/); assert.doesNotMatch(reviewHtml, /06_safe_ai_generated.*decision/);
  assert.match(reviewHtml, /workstation/); assert.match(reviewHtml, /grid-template-columns/); assert.match(reviewHtml, /review-panel/);
  assert.match(reviewHtml, /id="preview"/); assert.match(reviewHtml, /previewImage\.src=image\.src/); assert.match(reviewHtml, /e.key==='Escape'/); assert.match(reviewHtml, /preview\.classList\.contains\('open'\)/);
  assert.match(legacyReviewHtml, /STHN Sexual-Content Review/); assert.doesNotMatch(legacyReviewHtml, /image-stage/);
});

test("A6 compiles the actual generated inline reviewer script", () => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(reviewHtml);
  assert.ok(match, "review HTML must contain its client script");
  assert.doesNotThrow(() => new vm.Script(match[1], { filename: "sexualContentReviewUi.inline.js" }));
});

test("A6 preserves A5 explicit per-surface serialization", () => {
  const value = { USER_AVATAR: { decision: "BLOCK" as const, categories: ["AI_GENERATED_PERSON" as const] }, CREATOR_SERVICE_MEDIA: { decision: "PASS" as const, categories: [] } };
  assert.deepEqual(restoreExpectedBySurface(serializeExpectedBySurface(true, value)), { enabled: true, values: value });
});
