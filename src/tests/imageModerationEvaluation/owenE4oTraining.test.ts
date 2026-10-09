import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs");
const run = path.join(root, "e4o-first-head-seed-104729");
const sha256 = (content: Buffer) => createHash("sha256").update(content).digest("hex");

test("E4O run is bound to frozen authorities and head-only optimization", async () => {
  const [metadataText, script] = await Promise.all([
    readFile(path.join(run, "run-metadata.json"), "utf8"),
    readFile(path.join(root, "e4o-train.py"), "utf8"),
  ]);
  const metadata = JSON.parse(metadataText) as Record<string, any>;
  assert.deepEqual(metadata.authorities, {
    candidateFingerprint: "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b",
    fixtureIdentity: "71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f",
    splitFingerprint: "de209dc412f3272c06eaecd2314d882f45c7c3fdfddb1e70a48e68f1bdaa98d2",
  });
  assert.deepEqual(metadata.model.classMapping, { PASS: 0, BLOCK: 1 });
  assert.deepEqual([metadata.model.pretrainedParameters, metadata.model.trainableParameters, metadata.model.trainableNames], [3034686, 442, ["sthn_binary_head.weight", "sthn_binary_head.bias"]]);
  assert.equal(metadata.model.backboneMode, "eval");
  assert.equal(metadata.boundaries.holdoutAccessed, false);
  assert.equal(metadata.boundaries.onlyBinaryHeadOptimized, true);
  assert.equal(metadata.boundaries.backboneParametersChanged, false);
  assert.equal(metadata.backboneDigestBefore, metadata.backboneDigestAfter);
  assert.match(script, /train_rows,validation_rows=rows\(train\),rows\(validation\)/);
  assert.match(script, /extract_features\(backbone,train_images\).*extract_features\(backbone,validation_images\)/s);
  assert.match(script, /optimizer=torch\.optim\.AdamW\(named_head\.values\(\)/);
  assert.match(script, /with torch\.no_grad\(\):\s*for x,y,_ in loader:\s*feature=backbone\.forward_features\(x\)/s);
  assert.doesNotMatch(script, /HOLDOUT/);
});

test("E4O checkpoints and bounded reports are self-consistent", async () => {
  const [metadataText, historyText, errorsText, best, final] = await Promise.all([
    readFile(path.join(run, "run-metadata.json"), "utf8"), readFile(path.join(run, "training-history.json"), "utf8"),
    readFile(path.join(run, "validation-errors.json"), "utf8"), readFile(path.join(run, "best-head.safetensors")), readFile(path.join(run, "final-head.safetensors")),
  ]);
  const metadata = JSON.parse(metadataText) as Record<string, any>;
  const history = JSON.parse(historyText) as Array<Record<string, any>>;
  const errors = JSON.parse(errorsText) as { errors: Array<Record<string, unknown>> };
  assert.equal(sha256(best), metadata.bestHeadSha256);
  assert.equal(sha256(final), metadata.finalHeadSha256);
  assert.equal(history.length, metadata.stoppingEpoch);
  assert.equal(history.filter((epoch) => epoch.bestCheckpoint).length >= 1, true);
  assert.equal(metadata.bestValidation.confusion.matrix.flat().reduce((sum: number, value: number) => sum + value, 0), 112);
  assert.equal(metadata.bestValidation.confusion.fp + metadata.bestValidation.confusion.fn, errors.errors.length);
  assert.ok(errors.errors.every((error) => Object.keys(error).every((key) => !/path|bytes|base64|url/i.test(key))));
});
