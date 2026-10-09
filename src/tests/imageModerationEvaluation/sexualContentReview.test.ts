import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { importCandidateBytes, loadManifest } from "../../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { approvedFixturesFromLocalReviews, loadLocalReviewManifest, readCandidateAsset, saveLocalReview } from "../../evaluation/imageModeration/dataset/sexualContentReview.service";
import { createSexualContentReviewServer } from "../../evaluation/imageModeration/dataset/sexualContentReviewServer";
import { analyzeSexualContentReview, renderSexualContentReviewMarkdown } from "../../evaluation/imageModeration/dataset/sexualContentReviewReport.service";

const root = async () => mkdtemp(path.join(os.tmpdir(), "sthn-i4a3-"));
const picture = (red: number) => sharp({ create: { width: 3, height: 3, channels: 3, background: { r: red, g: 32, b: 64 } } }).png().toBuffer();
const candidate = async (cache: string, red = 32) => importCandidateBytes({ root: cache, bytes: await picture(red), coverageClass: "SWIMWEAR_PASS", source: { provider: "MANUAL", reference: "candidate.png", license: "Test license", sourceLabel: "source-sexy" } });
const complete = (candidateId: string, extra: Record<string, unknown> = {}) => ({ candidateId, state: "REVIEW_REQUIRED" as const, expectedDecision: "PASS" as const, categories: [], surfaces: ["CREATOR_SERVICE_MEDIA" as const], contextTags: ["SWIMWEAR" as const], difficulty: "CONTEXTUAL" as const, rationale: "Normal adult swimwear control without sexualized presentation.", policyVersion: "V1", license: "Test license", ...extra });

test("review state loads acquisition candidates and saving a draft never approves it", async () => {
  const cache = await root(); const item = await candidate(cache); const acquisition = await loadManifest(cache);
  const saved = await saveLocalReview(cache, acquisition, complete(item.id), "SAVE");
  assert.equal(saved.state, "REVIEW_REQUIRED");
  assert.equal((await loadLocalReviewManifest(cache)).reviews.length, 1);
  await assert.rejects(readCandidateAsset(cache, acquisition, "candidate-not-real"), /Unknown/);
});

test("approval requires complete explicit ground truth and source labels cannot become it", async () => {
  const cache = await root(); const item = await candidate(cache); const acquisition = await loadManifest(cache);
  await assert.rejects(saveLocalReview(cache, acquisition, { candidateId: item.id, state: "REVIEW_REQUIRED", rationale: "x" }, "APPROVE"), /complete/);
  await assert.rejects(saveLocalReview(cache, acquisition, complete(item.id, { surfaces: [] }), "APPROVE"), /surface/);
  await assert.rejects(saveLocalReview(cache, acquisition, complete(item.id, { difficulty: undefined }), "APPROVE"), /complete/);
  await assert.rejects(saveLocalReview(cache, acquisition, complete(item.id, { rationale: "" }), "APPROVE"), /complete/);
  await assert.rejects(saveLocalReview(cache, acquisition, complete(item.id, { expectedDecision: "BLOCK", categories: [] }), "APPROVE"), /category/);
  await assert.rejects(saveLocalReview(cache, acquisition, complete(item.id, { contextTags: ["NOT_A_TAG"] }), "APPROVE"), /context/);
  const approved = await saveLocalReview(cache, acquisition, complete(item.id), "APPROVE");
  assert.equal(approved.expectedDecision, "PASS"); assert.notEqual(acquisition.candidates[0].source.sourceLabel, approved.expectedDecision);
});

test("hash mismatch prevents promotion and excluded candidates remain non-official", async () => {
  const cache = await root(); const item = await candidate(cache); const acquisition = await loadManifest(cache);
  await saveLocalReview(cache, acquisition, { candidateId: item.id, state: "REVIEW_REQUIRED", exclusionReason: "BENCHMARK_REDUNDANT" }, "EXCLUDE");
  assert.equal((await approvedFixturesFromLocalReviews(cache, acquisition)).length, 0);
  const second = await candidate(cache, 90); const refreshed = await loadManifest(cache); const asset = path.join(cache, second.localAsset!);
  await writeFile(asset, await picture(120));
  await assert.rejects(saveLocalReview(cache, refreshed, complete(second.id), "APPROVE"), /hash mismatch/);
});

test("approved fixture promotion and boundary-pair validation are explicit", async () => {
  const cache = await root(); const one = await candidate(cache, 1); const two = await candidate(cache, 2); const acquisition = await loadManifest(cache);
  await saveLocalReview(cache, acquisition, complete(one.id, { boundaryPairId: "swimwear-pair" }), "APPROVE");
  await assert.rejects(approvedFixturesFromLocalReviews(cache, acquisition), /exactly two/);
  await saveLocalReview(cache, acquisition, complete(two.id, { boundaryPairId: "swimwear-pair" }), "APPROVE");
  const fixtures = await approvedFixturesFromLocalReviews(cache, acquisition);
  assert.equal(fixtures.length, 2); assert.equal(fixtures[0].localAsset?.startsWith("assets/"), true);
});

test("localhost server exposes only manifest candidates and bounded review endpoints", async () => {
  const cache = await root(); const item = await candidate(cache); const app = await createSexualContentReviewServer({ root: cache });
  try { assert.match(app.url, /^http:\/\/127\.0\.0\.1:/); const list = await fetch(`${app.url}/api/candidates`).then((response) => response.json()) as Array<{ id: string }>; assert.equal(list.length, 1); assert.equal(list[0].id, item.id);
    assert.equal((await fetch(`${app.url}/api/candidates/nope/image`)).status, 400);
    assert.equal((await fetch(`${app.url}/api/candidates/..%2F..%2Fwindows%2Fwin.ini/image`)).status, 404);
    assert.match((await fetch(`${app.url}/api/candidates/${item.id}/image`)).headers.get("content-type") ?? "", /^image\//);
    const draft = await fetch(`${app.url}/api/reviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SAVE", review: complete(item.id) }) }); assert.equal(draft.status, 200);
  } finally { await app.close(); }
});

test("unsafe candidate paths are rejected before any local file is read", async () => {
  const cache = await root(); const item = await candidate(cache); const acquisition = await loadManifest(cache);
  const unsafe = { ...acquisition, candidates: acquisition.candidates.map((entry) => entry.id === item.id ? { ...entry, localAsset: "../outside.png" } : entry) };
  await assert.rejects(readCandidateAsset(cache, unsafe, item.id), /unsafe|outside/);
});

test("review report counts only approved candidates and contains no image bytes", async () => {
  const cache = await root(); const item = await candidate(cache); const acquisition = await loadManifest(cache); const report = analyzeSexualContentReview(acquisition, await loadLocalReviewManifest(cache));
  assert.equal(report.approvedOfficialFixtureCount, 0); assert.equal(report.summary.reviewRequired, 1);
  assert.doesNotMatch(`${JSON.stringify(report)}\n${renderSexualContentReviewMarkdown(report)}`, /base64|<svg|Buffer|bytes"\s*:/i);
  assert.equal(JSON.parse(await readFile(path.join(cache, "acquisition-manifest.json"), "utf8")).schemaVersion, "STHN_IMAGE_SEXUAL_ACQUISITION_V1");
});
