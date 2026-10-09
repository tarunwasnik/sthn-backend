import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import * as ort from "onnxruntime-node";
import { PaddingDirection, Tokenizer, TruncationStrategy } from "tokenizers";

import { E5_SMALL_HIDDEN_DIMENSION, E5_SMALL_MODEL_REVISION } from "../research/textModerationDataset/semanticSimilarity/e5SmallExportContract";
import { writeImmutableFileAtomic } from "../research/textModerationDataset/mhsReviewImport";

const root = path.resolve(process.argv[2] ?? path.join(process.cwd(), "evaluation-cache", "text-moderation", "semantic",
  "intfloat-multilingual-e5-small", E5_SMALL_MODEL_REVISION));
const tokenizerPath = path.join(root, "source", "tokenizer.json");
const onnxPath = path.join(root, "export", "model.onnx");
const target = path.join(root, "certification", "node-runtime-certification.json");
const probes = ["A calm morning in the park.", "आज पुस्तकालय खुला है।", "วันนี้ห้องสมุดเปิด", "Build नमस्ते รุ่น 2!"] as const;
const shaFile = (filename: string): string => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const packageVersion = (name: string): string => (require(`${name}/package.json`) as { version: string }).version;

const tensors = (encodings: Awaited<ReturnType<Tokenizer["encodeBatch"]>>) => {
  const length = encodings[0].getIds().length;
  if (!encodings.length || encodings.some((item) => item.getIds().length !== length || item.getAttentionMask().length !== length)) throw new Error("Node tokenizer batch is not rectangular");
  return {
    input_ids: new ort.Tensor("int64", BigInt64Array.from(encodings.flatMap((item) => item.getIds()), BigInt), [encodings.length, length]),
    attention_mask: new ort.Tensor("int64", BigInt64Array.from(encodings.flatMap((item) => item.getAttentionMask()), BigInt), [encodings.length, length]),
  };
};

const run = async (): Promise<void> => {
  if (fs.existsSync(target)) throw new Error(`Immutable Node certification already exists: ${target}`);
  const tokenizer = Tokenizer.fromFile(tokenizerPath); tokenizer.setTruncation(512, { strategy: TruncationStrategy.LongestFirst, direction: "right", stride: 0 });
  const deterministic = await Promise.all(probes.map(async (text) => {
    const first = await tokenizer.encode(text); const second = await tokenizer.encode(text);
    return first.getIds().join(",") === second.getIds().join(",") && first.getAttentionMask().join(",") === second.getAttentionMask().join(",");
  }));
  if (deterministic.some((value) => !value)) throw new Error("Node tokenizer output is nondeterministic");
  const session = await ort.InferenceSession.create(onnxPath, { executionProviders: ["cpu"], graphOptimizationLevel: "all" });
  if (session.inputNames.join(",") !== "input_ids,attention_mask" || session.outputNames.join(",") !== "last_hidden_state") throw new Error("Node ONNX names violate GX contract");
  const sequenceDimensions: number[] = [];
  for (const text of probes) {
    tokenizer.disablePadding(); const encoded = await tokenizer.encode(text); const output = (await session.run(tensors([encoded]))).last_hidden_state;
    if (!output || output.type !== "float32" || output.dims[0] !== 1 || output.dims[1] !== encoded.getIds().length || output.dims[2] !== E5_SMALL_HIDDEN_DIMENSION) throw new Error("Node variable-sequence output violates GX contract");
    sequenceDimensions.push(output.dims[1]);
  }
  tokenizer.setPadding({ direction: PaddingDirection.Right, padId: 1, padTypeId: 0, padToken: "<pad>" });
  const batch = await tokenizer.encodeBatch([probes[0], probes[1]]); const feeds = tensors(batch);
  const first = (await session.run(feeds)).last_hidden_state; const second = (await session.run(feeds)).last_hidden_state;
  if (!first || !second || first.dims[0] !== 2 || first.dims[2] !== E5_SMALL_HIDDEN_DIMENSION) throw new Error("Node dynamic-batch output violates GX contract");
  const left = first.data as Float32Array; const right = second.data as Float32Array; let repeatedDifference = 0;
  for (let index = 0; index < left.length; index += 1) repeatedDifference = Math.max(repeatedDifference, Math.abs(left[index] - right[index]));
  if (repeatedDifference > 1e-7) throw new Error("Node repeated inference exceeded GX stability tolerance");
  const report = { schemaVersion: "STHN_E5_SMALL_NODE_RUNTIME_CERTIFICATION_V1", nodeVersion: process.version,
    onnxruntimeNodeVersion: packageVersion("onnxruntime-node"), tokenizersVersion: packageVersion("tokenizers"), executionProvider: "cpu",
    tokenizerSha256: shaFile(tokenizerPath), onnxSha256: shaFile(onnxPath), inputNames: session.inputNames, outputNames: session.outputNames,
    outputType: first.type, hiddenDimension: first.dims[2], dynamicBatchPassed: true, dynamicSequencePassed: new Set(sequenceDimensions).size > 1,
    repeatedInferenceMaxAbsoluteDifference: repeatedDifference, tokenizerDeterministic: true, status: "PASSED", frozenBenchmarkAccessed: false };
  if (!report.dynamicSequencePassed) throw new Error("Node dynamic-sequence certification did not exercise distinct lengths");
  writeImmutableFileAtomic(target, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report));
};

void run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "E5 Node certification failed"); process.exitCode = 1; });
