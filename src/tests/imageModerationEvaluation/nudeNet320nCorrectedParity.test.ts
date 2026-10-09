import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const read = (relative: string): Promise<Buffer> => readFile(path.join(root, relative));

test("G8-C binds the exact frozen G8-B/Python/model authorities and the unchanged 16-candidate subset", async () => {
  const [g8aR1, g8b, preregistration, python, model] = await Promise.all([
    read("evaluation-output/image-moderation/i4-g8a-r1-evidence-authority-recovery/g8a-r1-authority-recovery.json"),
    read("evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-nudenet-reference-parity.json"),
    read("evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-preregistration.json"),
    read("evaluation-output/image-moderation/i4-g8b-nudenet-reference-parity/g8b-python-reference.json"),
    read("evaluation-cache/image-moderation/specialists/nudenet-320n/320n.onnx"),
  ]);
  assert.equal(sha256(g8b), "7e4686fcf5ffd0c07ef851929ee7cd27a0e5dc8739a1efe0a0bc7b9b9caf1d5f");
  assert.equal(sha256(preregistration), "b7002420157e3b9f05d6e82d8703bccef05bd34ac6d2ec241e6937413c9a5623");
  assert.equal(sha256(python), "075cdae4e00290ce9da50c628f434e20e9c5582d237c48f224d7ba901d69a0db");
  assert.equal(sha256(model), "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f");
  assert.equal(JSON.parse(g8aR1.toString("utf8")).semanticEvidenceFingerprint, "221f8b2ce4d8f8323e0087752cffe8d035d4c1a12aa1c347eac02f072f470d1b");
  const record = JSON.parse(preregistration.toString("utf8"));
  assert.equal(record.selection.selected.length, 16);
  assert.equal(new Set(record.selection.selected.map((item: { candidateId: string }) => item.candidateId)).size, 16);
});
