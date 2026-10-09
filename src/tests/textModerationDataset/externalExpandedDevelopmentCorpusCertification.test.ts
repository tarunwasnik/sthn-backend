import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectJsonlIntegrity } from "../../research/textModerationDataset/externalExpandedDevelopmentCorpusCertification";

test("JSONL integrity audit fails closed on malformed physical records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-external-cert-")); const filename = path.join(directory, "synthetic.jsonl");
  try { fs.writeFileSync(filename, '{"id":1}\n{"id":\n'); const result = inspectJsonlIntegrity(filename); assert.equal(result.validJsonLines, 1); assert.equal(result.invalidJsonLines, 1); assert.equal(result.firstInvalidPhysicalLine, 2); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
