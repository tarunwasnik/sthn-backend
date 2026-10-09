import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";

const outputDirectory = path.join(process.cwd(), "evaluation-output", "image-moderation", "i4-g13a-marqo-runtime-authority");
const cacheDirectory = path.join(process.cwd(), "evaluation-cache", "image-moderation", "marqo-nsfw-image-detection-384", "0c26ec22111b83f106d72a55f611ec35962bcb65");
const modelPath = path.join(cacheDirectory, "derived", "marqo-nsfw-image-detection-384-evaluation-derived.onnx");
const referencePath = path.join(outputDirectory, "marqo-normalized-tensor-reference.json");
const pythonPath = path.join(outputDirectory, "marqo-same-tensor-python-onnx.json");
const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const expectedInputs: Record<string, string> = {
  "landscape-gradient": "9aaa9b47c9aced1a87ac031506ca6bd23a501cd3f47489f656d6b84ccbf0c22e",
  "portrait-gradient": "70320ed3bde3331c4848ac145a8a91113f6ee1fccb90c4641bf84ee6a8129060",
  "square-high-frequency": "f83646eaab7736d0f23f79a4215472f124d42443b816723315772139571d7063",
  "wide-asymmetric": "7f0cd47e385d3e5a64460988a18838b81e5edfc0962889945274613203dd22df",
  "tall-asymmetric": "3b7c70197444ec3a3180bd9c9f69938ba9df674ae395cd2e01fcb4a1803c69b0",
  "mixed-nondivisible": "c95afb40dfb51273541f3801955f973dfd86e1ba9078ff696cb0ad28f537929b",
};
type InputRow = { controlId: string; tensorBase64: string; digest: string; shape: number[]; dtype: string };
type RuntimeRow = { controlId: string; inputSha256: string; onnxSha256: string; outputSha256: string; logits: number[]; argmax: number; outputShape: number[]; outputDtype: string };
const json = async <T>(filePath: string): Promise<T> => JSON.parse(await readFile(filePath, "utf8")) as T;

void (async () => {
  const [reference, python, model] = await Promise.all([
    json<{ rows: InputRow[] }>(referencePath),
    json<{ runtime: unknown; modelSha256: string; rows: RuntimeRow[] }>(pythonPath),
    readFile(modelPath),
  ]);
  const modelSha256 = hash(model);
  if (modelSha256 !== "edf707afd44b9cd64c3436dec22169ab0ddc82fb200c627ce491d787b9a36be9" || python.modelSha256 !== modelSha256) throw new Error("ONNX model authority mismatch");
  const pythonByControl = new Map(python.rows.map((row) => [row.controlId, row]));
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
  const nodeRows: RuntimeRow[] = [];
  const rows: Array<Record<string, unknown>> = [];
  try {
    for (const source of reference.rows) {
      const raw = Buffer.from(source.tensorBase64, "base64");
      const inputSha256 = hash(raw);
      if (source.shape.join(",") !== "1,3,384,384" || source.dtype !== "float32" || raw.byteLength !== 1769472 || source.digest !== inputSha256 || expectedInputs[source.controlId] !== inputSha256) throw new Error(`canonical tensor mismatch: ${source.controlId}`);
      const pythonRow = pythonByControl.get(source.controlId);
      if (!pythonRow || pythonRow.inputSha256 !== inputSha256 || pythonRow.onnxSha256 !== modelSha256) throw new Error(`Python input/model mismatch: ${source.controlId}`);
      const input = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / Float32Array.BYTES_PER_ELEMENT);
      const output = (await session.run({ input: new ort.Tensor("float32", input, [1, 3, 384, 384]) })).logits;
      const values = output.data as Float32Array;
      if (output.dims.join(",") !== "1,2" || !(values instanceof Float32Array)) throw new Error(`unexpected output contract: ${source.controlId}`);
      const outputRaw = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
      const nodeRow: RuntimeRow = { controlId: source.controlId, inputSha256, onnxSha256: modelSha256, outputSha256: hash(outputRaw), logits: [...values], argmax: values[0] >= values[1] ? 0 : 1, outputShape: Array.from(output.dims), outputDtype: "float32" };
      nodeRows.push(nodeRow);
      let differingFloat32 = 0, maxAbsoluteDifference = 0, sumAbsoluteDifference = 0;
      for (let index = 0; index < values.length; index += 1) { const difference = Math.abs(values[index] - pythonRow.logits[index]); if (difference !== 0) differingFloat32 += 1; maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference); sumAbsoluteDifference += difference; }
      rows.push({ controlId: source.controlId, inputSha256, inputByteExact: true, onnxByteExact: pythonRow.onnxSha256 === nodeRow.onnxSha256, pythonLogits: pythonRow.logits, nodeLogits: nodeRow.logits, pythonOutputSha256: pythonRow.outputSha256, nodeOutputSha256: nodeRow.outputSha256, rawOutputByteExact: pythonRow.outputSha256 === nodeRow.outputSha256, logit0AbsoluteDifference: Math.abs(values[0] - pythonRow.logits[0]), logit1AbsoluteDifference: Math.abs(values[1] - pythonRow.logits[1]), differingFloat32, maxAbsoluteDifference, meanAbsoluteDifference: sumAbsoluteDifference / values.length, argmaxAgreement: pythonRow.argmax === nodeRow.argmax });
    }
  } finally { await session.release(); }
  const exactFixtures = rows.filter((row) => row.rawOutputByteExact === true).length;
  const bounded = rows.every((row) => Number(row.maxAbsoluteDifference) <= 0.0001 && row.argmaxAgreement === true);
  const classification = exactFixtures === rows.length ? "EXACT" : bounded ? "BOUNDED" : "FAILED";
  const status = classification === "FAILED" ? "MARQO_SAME_TENSOR_PYTHON_NODE_ONNX_RUNTIME_PARITY_FAILED" : `MARQO_SAME_TENSOR_PYTHON_NODE_ONNX_RUNTIME_PARITY_CONFIRMED — ${classification}`;
  const nodeEvidenceBase = { runtime: { node: process.version, onnxruntime: require("onnxruntime-node/package.json").version, provider: "cpu" }, modelSha256, inputContract: { name: "input", shape: [1, 3, 384, 384], dtype: "float32" }, outputContract: { name: "logits", shape: [1, 2], dtype: "float32", nativeClassOrder: ["NSFW", "SFW"], postprocessing: "none" }, rows: nodeRows };
  const nodeEvidence = { ...nodeEvidenceBase, semanticFingerprint: hash(JSON.stringify(nodeEvidenceBase)) };
  const totalAbsoluteDifference = rows.reduce((sum, row) => sum + Number(row.meanAbsoluteDifference) * 2, 0);
  const parityBase = { status, classification, tolerance: 0.0001, modelSha256, pythonRuntime: python.runtime, rows, aggregate: { fixturesExecuted: rows.length, identicalSharedInputDigests: rows.filter((row) => row.inputByteExact === true).length, identicalOnnxArtifacts: rows.filter((row) => row.onnxByteExact === true).length, exactFixtures, totalDifferingFloat32: rows.reduce((sum, row) => sum + Number(row.differingFloat32), 0), worstAbsoluteDifference: Math.max(...rows.map((row) => Number(row.maxAbsoluteDifference))), aggregateMeanAbsoluteDifference: totalAbsoluteDifference / (rows.length * 2), argmaxAgreementControls: rows.filter((row) => row.argmaxAgreement === true).length } };
  const parity = { ...parityBase, semanticFingerprint: hash(JSON.stringify(parityBase)) };
  const semanticFingerprint = parity.semanticFingerprint;
  const gate = { status, classification, semanticFingerprint, evidence: ["marqo-same-tensor-python-onnx.json", "marqo-same-tensor-node-onnx.json", "marqo-same-tensor-runtime-parity.json"], scope: "six persisted canonical Float32 NCHW tensors only; no image preprocessing and no benchmark access" };
  await Promise.all([
    writeFile(path.join(outputDirectory, "marqo-same-tensor-node-onnx.json"), JSON.stringify(nodeEvidence, null, 2) + "\n", { flag: "wx" }),
    writeFile(path.join(outputDirectory, "marqo-same-tensor-runtime-parity.json"), JSON.stringify(parity, null, 2) + "\n", { flag: "wx" }),
    writeFile(path.join(outputDirectory, "marqo-same-tensor-runtime-gate-report.json"), JSON.stringify(gate, null, 2) + "\n", { flag: "wx" }),
  ]);
  console.log(JSON.stringify({ status, classification, ...parity.aggregate, semanticFingerprint }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
