import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd(), corpus = path.join(root, "dataset-research/text-moderation/experimental-expanded-training-v1");
const sha = (name: string): string => crypto.createHash("sha256").update(fs.readFileSync(path.join(corpus, name))).digest("hex");
const rows = (name: string): Record<string, unknown>[] => fs.readFileSync(path.join(corpus, name), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
const runner = fs.readFileSync(path.join(root, "src/research/textModerationDataset/training/run_experimental_expanded_training.py"), "utf8");

test("expanded runner binds the verified corpus and schema", () => {
  assert.equal(sha("train.jsonl"), "c0592b9cbfc4ed67276115f1cce2a8015da457df4fb2104d3d3f69bab65d7e63");
  assert.equal(sha("validation.jsonl"), "329d96fa300c9b0baf13bf378874001d5a13c76b0a3d1e717b9d0410b3430a7e");
  assert.equal(rows("train.jsonl").length, 12900); assert.equal(rows("validation.jsonl").length, 1433);
  const all = [...rows("train.jsonl"), ...rows("validation.jsonl")];
  assert.equal(all.filter((row) => row.target === 0 && row.primaryCategory === null).length, 6000);
  assert.equal(all.filter((row) => row.target === 1 && row.primaryCategory === null).length, 4000);
  assert.equal(all.filter((row) => row.target === 1 && row.primaryCategory === "HATE").length, 1000);
});
test("runner preserves masked auxiliary, geometry, and reproducibility bindings", () => {
  for (const value of ["CATEGORY_TO_ID", "AUXILIARY_WEIGHT", "mhs_v2_successor_model.py", "12900", "1433", "1613", "180", "BATCH, EPOCHS", "auxiliaryTarget", "auxiliaryMask", "run-manifest.json"]) assert.match(runner, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(runner, /AUXILIARY_WEIGHT/); assert.match(runner, /use_cpu=True/); assert.match(runner, /OUTPUT\.exists\(\)/);
});
