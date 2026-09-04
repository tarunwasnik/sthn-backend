import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertY4EvaluationOnly, summarizeY4LiveCaptureInspection, y4OpaqueLiveAnchorId } from "../../evaluation/y4ProfileMediaCalibration.service";
import { auditY4LiveAnchorManifest, generateY4LiveAnchorManifest, y4LiveAnchorManifestHash } from "../../evaluation/y4LiveAnchorCalibration.service";

const inspection = {
  captures: [{ index: 0, usable: true }, { index: 1, usable: true }, { index: 2, usable: true }, { index: 3, usable: false }],
  pairs: [{ left: 0, right: 1, similarity: .2 }, { left: 0, right: 2, similarity: .6 }, { left: 1, right: 2, similarity: .4 }],
};

test("Gate-1 coherence summaries use deterministic pairs and per-capture peer medians", () => {
  const summary = summarizeY4LiveCaptureInspection(inspection);
  assert.equal(summary.usableCaptureCount, 3); assert.equal(summary.pairwiseComparisonCount, 3);
  assert.equal(summary.pairwise?.minimumSimilarity, .2); assert.equal(summary.pairwise?.maximumSimilarity, .6); assert.equal(summary.pairwise?.medianSimilarity, .4);
  assert.ok(Math.abs((summary.pairwise?.meanSimilarity ?? 0) - .4) < 1e-12); assert.ok(Math.abs((summary.pairwise?.p25 ?? 0) - .3) < 1e-12);
  assert.ok(Math.abs((summary.weakestPeerMedian ?? 0) - .3) < 1e-12); assert.equal(summary.strongestPeerMedian, .5);
});

test("Gate-1 opaque IDs are stable and do not contain source-media text", () => {
  const files = ["D:/dataset/identity-a/one.jpg", "D:/dataset/identity-a/two.jpg"];
  const id = y4OpaqueLiveAnchorId(files);
  assert.equal(id, y4OpaqueLiveAnchorId(files));
  assert.notEqual(id, y4OpaqueLiveAnchorId([...files].reverse()));
  assert.equal(id.includes("identity-a"), false);
  assert.match(id, /^Y4_LIVE_ANCHOR_[A-F0-9]{16}$/);
});

test("Gate-1 manifest audit enforces same/mixed truth, source exclusion, and no overlap", () => {
  const audit = auditY4LiveAnchorManifest({ schemaVersion: "STHN_Y4_LIVE_ANCHOR_CALIBRATION_V1", anchors: [
    { anchorId: "A", family: "COHERENT_SAME_IDENTITY_ANCHOR", captures: ["/a/1.jpg", "/a/2.jpg", "/a/3.jpg", "/a/4.jpg", "/a/5.jpg"] },
    { anchorId: "B", family: "MIXED_IDENTITY_ANCHOR_4_PLUS_1", captures: ["/b/1.jpg", "/b/2.jpg", "/b/3.jpg", "/b/4.jpg", "/c/1.jpg"] },
  ] }, new Set(["/z/unused.jpg"]));
  assert.equal(audit.sourceMediaOverlap, 0); assert.equal(audit.duplicateSourceMedia, 0); assert.equal(audit.duplicateAnchorCompositions, 0); assert.equal(audit.invalidTruthRows, 0);
  assert.deepEqual(audit.foreignPositionCounts.fourPlusOne, [0, 0, 0, 0, 1]); assert.equal(JSON.stringify(audit).includes("/a/1.jpg"), false);
  const invalid = auditY4LiveAnchorManifest({ schemaVersion: "STHN_Y4_LIVE_ANCHOR_CALIBRATION_V1", anchors: [{ anchorId: "C", family: "COHERENT_SAME_IDENTITY_ANCHOR", captures: ["/a/1.jpg", "/b/2.jpg"] as unknown as [string, string, string, string, string] }] }, new Set([path.resolve("/a/1.jpg").toLocaleLowerCase()]));
  assert.equal(invalid.sourceMediaOverlap, 1); assert.equal(invalid.invalidTruthRows, 1);
});

test("Gate-1 manifest generation is deterministic, score-independent, source-disjoint, and position-balanced", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sthn-y4g-"));
  try {
    for (let identity = 0; identity < 500; identity += 1) { const directory = path.join(root, `identity-${String(identity).padStart(3, "0")}`); await mkdir(directory); await Promise.all(Array.from({ length: 20 }, (_, index) => writeFile(path.join(directory, `${index}.jpg`), "fixture"))); }
    const excluded = new Set([path.resolve(root, "identity-000", "0.jpg").toLocaleLowerCase()]);
    const first = await generateY4LiveAnchorManifest({ datasetRoot: root, excludedSourceMedia: excluded });
    const second = await generateY4LiveAnchorManifest({ datasetRoot: root, excludedSourceMedia: excluded });
    assert.equal(y4LiveAnchorManifestHash(first), y4LiveAnchorManifestHash(second));
    const audit = auditY4LiveAnchorManifest(first, excluded);
    assert.deepEqual(audit.familyCounts, { COHERENT_SAME_IDENTITY_ANCHOR: 300, MIXED_IDENTITY_ANCHOR_4_PLUS_1: 150, MIXED_IDENTITY_ANCHOR_3_PLUS_2: 150 });
    assert.equal(audit.anchorCount, 600); assert.equal(audit.sourceMediaOverlap, 0); assert.equal(audit.duplicateSourceMedia, 0); assert.equal(audit.duplicateAnchorCompositions, 0); assert.equal(audit.invalidTruthRows, 0);
    assert.deepEqual(audit.foreignPositionCounts.fourPlusOne, [30, 30, 30, 30, 30]); assert.deepEqual(audit.foreignPositionCounts.threePlusTwo, [60, 60, 60, 60, 60]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Gate-1 evaluation is rejected in production mode", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  assert.throws(assertY4EvaluationOnly, /development-only/);
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
});
