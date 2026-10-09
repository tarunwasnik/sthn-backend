import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const runnerPath = path.join(root, "src/research/textModerationDataset/training/run_experimental_expanded_diagnostic_evaluation.py");
const python = path.join(root, "evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/e73636d4f797dec63c3081bb6ed5c7b0bb3f2089/.venv/Scripts/python.exe");
const validation = path.join(root, "dataset-research/text-moderation/experimental-expanded-training-v1/validation.jsonl");
const model = path.join(root, "evaluation-cache/text-moderation/classifier-training/experimental-expanded-training-v1/final/model.safetensors");
const source = fs.readFileSync(runnerPath, "utf8");
const sha = (filename: string) => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

test("diagnostic runner binds the trained model and development validation", () => {
  assert.equal(sha(model), "b526781ad69abeacfce8ee19c0795a09c9b0d166e345b84a1a212f240162172f");
  assert.equal(sha(validation), "329d96fa300c9b0baf13bf378874001d5a13c76b0a3d1e717b9d0410b3430a7e");
  assert.equal(fs.readFileSync(validation, "utf8").trim().split("\n").length, 1433);
  for (const binding of ["EXPECTED_MODEL_SHA", "EXPECTED_VALIDATION_SHA", "EXPECTED_VALIDATION_ROWS = 1433", "ARGMAX_BINARY_LOGITS", "BATCH_SIZE = 8"]) assert.match(source, new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("diagnostic runner preserves adapters, artifacts, and boundaries", () => {
  for (const value of ["Dynamically Generated Hate Dataset v0.2.3.csv", "all_cases.csv", "hatecheck_cases_final_", '"hate": 1', '"nothate": 0', '"hateful": 1', '"non-hateful": 0', "missingOrEmptyText", "unmappedLabel", "combined-diagnostics", "run-manifest.json", "blockRecallByCategory", "languageSlices", "functionalitySlices", "os.replace(staging, OUTPUT)"]) assert.match(source, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /INTERNAL_TEST|frozen 140|frozen.*benchmark|benchmark.*frozen/iu);
});

test("diagnostic runner mechanical Python suite does not load XLM-R", () => {
  const pythonTest = path.join(root, "src/tests/textModerationDataset/test_experimental_expanded_diagnostic_evaluation.py");
  const result = spawnSync(python, [pythonTest, "-q"], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 2 tests/u);
});
