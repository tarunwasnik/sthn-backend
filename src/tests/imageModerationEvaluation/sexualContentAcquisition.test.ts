import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { acquisitionSummary, downloadBounded, importCandidateBytes, importManualIncoming, loadManifest, validateAcquisitionUrl } from "../../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { analyzeSexualContentAcquisition, renderSexualContentAcquisitionMarkdown } from "../../evaluation/imageModeration/dataset/sexualContentAcquisitionReport.service";

const root = async () => mkdtemp(path.join(os.tmpdir(), "sthn-i4a2-"));
const image = async () => sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 32, g: 64, b: 96 } } }).png().toBuffer();
const source = { provider: "MANUAL" as const, reference: "licensed-local.png", license: "Internal evaluation candidate", sourceLabel: "source-vocabulary-only" };

test("valid candidates are locally cached as review-required, never approved", async () => {
  const cache = await root();
  const result = await importCandidateBytes({ root: cache, bytes: await image(), coverageClass: "SWIMWEAR_PASS", source });
  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.ok(result.localAsset?.startsWith("assets/candidate-"));
  assert.match(result.sha256 ?? "", /^[a-f0-9]{64}$/);
  const manifest = await loadManifest(cache);
  assert.equal(manifest.candidates[0].state, "REVIEW_REQUIRED");
  assert.notEqual(manifest.candidates[0].source.sourceLabel, "PASS");
});

test("invalid bytes and an exact SHA-256 duplicate are recorded safely", async () => {
  const cache = await root();
  const bytes = await image();
  await importCandidateBytes({ root: cache, bytes, coverageClass: "FITNESS_PASS", source });
  const duplicate = await importCandidateBytes({ root: cache, bytes, coverageClass: "FITNESS_PASS", source });
  const invalid = await importCandidateBytes({ root: cache, bytes: Buffer.from("not an image"), coverageClass: "FITNESS_PASS", source });
  assert.equal(duplicate.state, "DUPLICATE");
  assert.equal(invalid.state, "INVALID");
  assert.equal(acquisitionSummary(await loadManifest(cache)).reviewRequired, 1);
});

test("manual intake accepts supported images, skips unsupported paths, and validates coverage", async () => {
  const cache = await root();
  const incoming = path.join(cache, "manual-incoming");
  await mkdir(incoming, { recursive: true });
  await writeFile(path.join(incoming, "candidate.png"), await image());
  await writeFile(path.join(incoming, "not-an-image.txt"), "ignored");
  const imported = await importManualIncoming(cache, "ORDINARY_PORTRAIT_PASS");
  assert.equal(imported.length, 1);
  await assert.rejects(importManualIncoming(cache, "NOT_A_CLASS" as never), /Unknown/);
});

test("only HTTPS Wikimedia download URLs are allowed and oversized responses are bounded", async () => {
  assert.throws(() => validateAcquisitionUrl("https://example.com/image.jpg"), /allowed Wikimedia/);
  assert.throws(() => validateAcquisitionUrl("http://upload.wikimedia.org/image.jpg"), /allowed Wikimedia/);
  const fakeFetch = async () => new Response(Buffer.alloc(10 * 1024 * 1024 + 1), { status: 200 });
  await assert.rejects(downloadBounded("https://upload.wikimedia.org/example.jpg", fakeFetch as typeof fetch), /exceeds/);
});

test("acquisition analysis exposes review-pool gaps without claiming official evidence or image bytes", async () => {
  const cache = await root();
  await importCandidateBytes({ root: cache, bytes: await image(), coverageClass: "SWIMWEAR_PASS", source });
  const analysis = analyzeSexualContentAcquisition(await loadManifest(cache));
  assert.equal(analysis.reviewRequiredCandidatesAreNotOfficialEvidence, true);
  assert.equal(analysis.coverage.find((item) => item.coverageClass === "SWIMWEAR_PASS")?.reviewRequiredCandidates, 1);
  assert.doesNotMatch(`${JSON.stringify(analysis)}\n${renderSexualContentAcquisitionMarkdown(analysis)}`, /base64|<svg|Buffer|bytes"\s*:/i);
  assert.equal(JSON.parse(await readFile(path.join(cache, "acquisition-manifest.json"), "utf8")).schemaVersion, "STHN_IMAGE_SEXUAL_ACQUISITION_V1");
});
