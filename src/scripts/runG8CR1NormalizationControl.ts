import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tensorFromVerifiedRgb } from "../evaluation/imageModeration/nudeNet320nCorrectedPreprocess";

const execFileAsync = promisify(execFile);
const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r1-preprocessing-stage-isolation");

const compare = (left: Buffer, right: Buffer) => {
  let differingBytes = 0, maxAbsoluteDifference = 0, sum = 0;
  for (let index = 0; index < left.length; index += 1) { const delta = Math.abs(left[index] - right[index]); if (delta) differingBytes += 1; maxAbsoluteDifference = Math.max(maxAbsoluteDifference, delta); sum += delta; }
  return { exact: left.length === right.length && differingBytes === 0, lengthEqual: left.length === right.length, differingBytes, differingFraction: differingBytes / left.length, maxAbsoluteDifference, meanAbsoluteDifference: sum / left.length };
};

void (async () => {
  const selectionBytes = await readFile(path.join(output, "g8c-r1-diagnostic-selection.json"));
  const implementation = await readFile(path.join(root, "src", "evaluation", "imageModeration", "nudeNet320nCorrectedPreprocess.ts"));
  if (hash(implementation) !== "0a4a18d29c9d5a9b700d7ff2adf87d8edb0e84f2a12590edbaae4f50c7cdd981") throw new Error("Frozen corrected preprocessing changed");
  const selection = JSON.parse(selectionBytes.toString("utf8")).selection as readonly { candidateId: string }[];
  const inventory = JSON.parse(await readFile(path.join(root, "evaluation-cache", "image-moderation", "benchmark", "inventory-manifest.json"), "utf8"));
  const byId = new Map<string, any>(inventory.candidates.map((candidate: any) => [candidate.id, candidate]));
  const python = path.join(root, "evaluation-cache", "image-moderation", "g8b-nudenet-reference-parity", "venv", "Scripts", "python.exe");
  const rows = [];
  for (const item of selection) {
    const candidate = byId.get(item.candidateId); const imagePath = path.join(root, "evaluation-cache", "image-moderation", "benchmark", candidate.localAsset);
    const { stdout } = await execFileAsync(python, [path.join(root, "src", "scripts", "g8cR1CanonicalPreprocess.py"), imagePath], { maxBuffer: 64 * 1024 * 1024 });
    const canonical = JSON.parse(stdout);
    const resized = Buffer.from(canonical.resized.base64, "base64");
    const nodeTensor = tensorFromVerifiedRgb({ data: resized, width: 320, height: 320, channels: 3 });
    const nodeBytes = Buffer.from(nodeTensor.data.buffer, nodeTensor.data.byteOffset, nodeTensor.data.byteLength);
    rows.push({ candidateId: candidate.id, canonicalManualTensorSha256: canonical.manualTensor.sha256, nodeTensorSha256: nodeTensor.digest, comparison: compare(Buffer.from(canonical.manualTensor.base64, "base64"), nodeBytes) });
  }
  const payload = { schemaVersion: "STHN_I4_G8C_R1_IDENTICAL_RGB_NCHW_CONTROL_V1", purpose: "Canonical 320x320 RGB bytes directly fed into frozen Node Float32 RGB-NCHW constructor", rows, allExact: rows.every((row) => row.comparison.exact), prohibitions: { modelInference: false, preprocessingModification: false, stageB: false } };
  const report = { ...payload, reportFingerprint: hash(JSON.stringify(payload)) };
  await writeFile(path.join(output, "g8c-r1-identical-rgb-nchw-control.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ allExact: report.allExact, reportFingerprint: report.reportFingerprint }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
