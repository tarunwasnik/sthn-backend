import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prepareVggFace2TierA, prepareVggFace2Y2DNonMatch, writeVggFace2TierA, Y2D_BATCH_SIZE, Y2D_NON_MATCH_TARGET } from "../../evaluation/vggFace2CalibrationPreparation.service";

const createFixture = async (identityCount = 60, imageCount = 6) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sthn-vgg2-"));
  for (let identity = 0; identity < identityCount; identity += 1) {
    const directory = path.join(root, `identity-${String(identity).padStart(3, "0")}`);
    await mkdir(directory);
    for (let image = 0; image < imageCount; image += 1) await writeFile(path.join(directory, `${String(image).padStart(3, "0")}.jpg`), "fixture");
  }
  return root;
};

test("VGGFace2 Tier A preparation is deterministic, opaque, and preserves 1:1 identity rules", async () => {
  const root = await createFixture(); const manifestDirectory = path.join(root, "manifest"); await mkdir(manifestDirectory);
  try {
    const first = await prepareVggFace2TierA(root, manifestDirectory); const second = await prepareVggFace2TierA(root, manifestDirectory);
    assert.deepEqual(first, second); assert.equal(first.manifest.samples.filter((sample) => sample.expectedLabel === "MATCH").length, 20); assert.equal(first.manifest.samples.filter((sample) => sample.expectedLabel === "NON_MATCH").length, 20);
    assert.equal(first.manifest.samples.every((sample) => /^VGG2_TA_[MN]_\d{3}$/.test(sample.sampleId) && sample.captures.length === 5 && new Set([sample.reference, ...sample.captures]).size === 6), true);
    for (const sample of first.manifest.samples) {
      const referenceIdentity = path.dirname(sample.reference); const captureIdentities = new Set(sample.captures.map((capture) => path.dirname(capture)));
      assert.equal(captureIdentities.size, 1); assert.equal(sample.expectedLabel === "MATCH" ? captureIdentities.has(referenceIdentity) : !captureIdentities.has(referenceIdentity), true);
    }
    assert.equal(new Set(first.manifest.samples.map((sample) => `${sample.expectedLabel}:${sample.reference}:${sample.captures.join("|")}`)).size, 40);
    assert.equal(/mongoose|ProfileVerificationRequest|score|embedding/i.test(JSON.stringify(first.manifest)), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("VGGFace2 Tier A preparation rejects insufficient identities and missing selected files", async () => {
  const insufficient = await createFixture(59); const missing = await createFixture(); const manifestDirectory = path.join(missing, "manifest"); await mkdir(manifestDirectory);
  try {
    await assert.rejects(() => prepareVggFace2TierA(insufficient, path.join(insufficient, "manifest")), /insufficient eligible identities/);
    await rm(path.join(missing, "identity-000", "000.jpg"));
    await assert.rejects(() => prepareVggFace2TierA(missing, manifestDirectory), /insufficient eligible identities|missing/);
  } finally { await Promise.all([rm(insufficient, { recursive: true, force: true }), rm(missing, { recursive: true, force: true })]); }
});

test("VGGFace2 Tier A writer emits only manifest and bounded preparation metadata", async () => {
  const root = await createFixture(); const manifestDirectory = path.join(root, "manifest"); const manifestPath = path.join(manifestDirectory, "tier-a.json"); await mkdir(manifestDirectory);
  try {
    await writeVggFace2TierA(root, manifestPath);
    const metadata = await readFile(path.join(manifestDirectory, "tier-a.preparation.json"), "utf8");
    assert.equal(/identity-|\.jpg|[A-Za-z]:\\/i.test(metadata), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Y2D preparation deterministically partitions its global score-independent non-match sequence into bounded batches", async () => {
  const root = await createFixture(20); const manifestDirectory = path.join(root, "manifest"); await mkdir(manifestDirectory);
  try {
    const options = { target: 100, batchSize: 20 }; const first = await prepareVggFace2Y2DNonMatch(root, manifestDirectory, [], options); const second = await prepareVggFace2Y2DNonMatch(root, manifestDirectory, [], options);
    const samples = first.batches.flatMap((batch) => batch.samples);
    assert.deepEqual(first, second); assert.equal(Y2D_NON_MATCH_TARGET, 5_000); assert.equal(Y2D_BATCH_SIZE, 1_000); assert.equal(first.batches.length, 5); assert.equal(samples.length, 100);
    assert.equal(first.batches.every((batch) => batch.samples.length === 20), true); assert.equal(new Set(samples.map((sample) => sample.sampleId)).size, 100);
    const pairs = samples.map((sample) => `${path.dirname(sample.reference)}>${path.dirname(sample.captures[0])}`); assert.equal(new Set(pairs).size, 100); assert.equal(samples.every((sample) => path.dirname(sample.reference) !== path.dirname(sample.captures[0]) && new Set(sample.captures.map((capture) => path.dirname(capture))).size === 1), true);
    assert.equal(first.metadata.duplicateOrderedPairs, 0); assert.equal(first.metadata.selfPairs, 0); assert.equal(first.metadata.exactDuplicateComparisons, 0); assert.deepEqual(first.metadata.referenceIdentityUsage, { minimum: 5, maximum: 5, mean: 5 }); assert.deepEqual(first.metadata.captureIdentityUsage, { minimum: 5, maximum: 5, mean: 5 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
