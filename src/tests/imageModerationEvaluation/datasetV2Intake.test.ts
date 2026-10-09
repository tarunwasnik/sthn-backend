import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { applyManualLeakageGroup, dHash, hamming, intakeDatasetV2, repositorySafeDatasetV2Manifest } from "../../evaluation/imageModeration/dataset/datasetV2Intake.service";

const temp = () => mkdtemp(path.join(os.tmpdir(), "sthn-i4d2-"));
const image = (colour: string, format: "jpeg" | "png" = "jpeg") => sharp({ create: { width: 48, height: 32, channels: 3, background: colour } })[format]().toBuffer();
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("D2 is deterministic, private, unlabelled, and flags exact cross-pool leakage", async () => {
  const root = await temp(); const other = await temp(); try {
    const red = await image("red"); const blue = await image("blue");
    const input = [{ pool: "DEVELOPMENT" as const, bytes: red, name: "red.jpg", sourceGroup: "private-A" }, { pool: "HOLDOUT" as const, bytes: red, name: "copy.jpg", sourceGroup: "private-B" }, { pool: "HOLDOUT" as const, bytes: blue, name: "blue.jpg" }];
    const result = await intakeDatasetV2({ root, files: input }); const again = await intakeDatasetV2({ root: other, files: input });
    assert.equal(result.valid, 3); assert.ok(result.crossPoolLeakage >= 1); assert.equal(result.exactDuplicates, 1); assert.equal(result.manifest.fingerprint, again.manifest.fingerprint);
    assert.ok(result.manifest.candidates.every((x) => x.state === "REVIEW_REQUIRED")); assert.ok(result.manifest.candidates.every((x) => !("decision" in x) && !("categories" in x)));
    const safe = JSON.stringify(repositorySafeDatasetV2Manifest(result.manifest)); assert.ok(!safe.includes(root)); assert.ok(!safe.includes("relativeAsset"));
  } finally { await rm(root, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
});

test("D2 dHash is deterministic and recompression is evidence rather than authority", async () => {
  const root = await temp(); try {
    const png = await image("#c43d55", "png"); const jpeg = await sharp(png).jpeg({ quality: 80 }).toBuffer(); const blue = await image("blue");
    assert.equal(await dHash(png), await dHash(png)); assert.equal(hamming(await dHash(png), await dHash(jpeg)), 0); assert.notEqual(sha(png), sha(blue));
    const result = await intakeDatasetV2({ root, nearDistance: 8, files: [{ pool: "DEVELOPMENT", bytes: png, name: "one.png" }, { pool: "DEVELOPMENT", bytes: jpeg, name: "one.jpg" }] });
    assert.ok(result.nearDuplicates >= 1); assert.ok(result.manifest.candidates.some((x) => x.flags.includes("NEAR_DUPLICATE_CANDIDATE"))); assert.ok(result.manifest.candidates.every((x) => x.state === "REVIEW_REQUIRED"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("D2 manual cross-pool grouping remains explicit and V1 collisions are read-only evidence", async () => {
  const root = await temp(); const other = await temp(); try {
    const a = await image("red"); const b = await image("green"); const first = await intakeDatasetV2({ root, files: [{ pool: "DEVELOPMENT", bytes: a, name: "a.jpg" }, { pool: "HOLDOUT", bytes: b, name: "b.jpg" }] });
    const grouped = applyManualLeakageGroup(first.manifest, first.manifest.candidates.map((x) => x.candidateId), "same-shoot"); assert.ok(grouped.candidates.every((x) => x.flags.includes("CROSS_POOL_LEAKAGE") && x.leakageGroups.includes("MANUAL:same-shoot")));
    const collision = await intakeDatasetV2({ root: other, files: [{ pool: "HOLDOUT", bytes: a, name: "a.jpg" }], references: [{ candidateId: "v1-a", sha256: first.manifest.candidates[0].sha256 }] });
    assert.ok(collision.manifest.candidates[0].flags.includes("V1_REFERENCE_COLLISION"));
  } finally { await rm(root, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
});
