import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("R10 invokes Python with its helper script before model and tensor paths", async () => {
  const source = await readFile(path.join(process.cwd(), "src/scripts/runG8CR10SameTensorOrtParity.ts"), "utf8");
  assert.ok(source.includes("exec(py,[pys,model,f]"));
  assert.ok(source.includes("const exec=promisify(execFile)"));
});
