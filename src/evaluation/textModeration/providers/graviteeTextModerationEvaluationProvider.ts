import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import * as ort from "onnxruntime-node";
import { PaddingDirection, Tokenizer, TruncationStrategy } from "tokenizers";

import {
  ProviderEvaluationResult,
  RawProviderScalar,
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "../textModerationEvaluation.types";

export const GRAVITEE_MODEL_ID = "gravitee-io/distilbert-multilingual-toxicity-classifier" as const;
export const GRAVITEE_MODEL_REVISION = "865ad1b453a49e4a7f2471fc40b727ececd28314" as const;
export const GRAVITEE_ARTIFACT_NAME = "model.quant.onnx" as const;
export const GRAVITEE_ARTIFACT_SHA256 = "c8169782758fe097c6cf036ddc48f6ff7b3c861764d6124c20d8b31bc0ba93d7" as const;
export const GRAVITEE_ARTIFACT_BYTES = 135_582_999 as const;
export const GRAVITEE_TOKENIZER_SHA256 = "c2c0e4d392f08c2c2eb950156eb26e4e5ddd15b557faa45ed6a0decaf45b5f98" as const;
export const GRAVITEE_CONFIG_SHA256 = "7e96ac0dba63fb0bfe1f65fa533e7e0720b609fe88ed658050f01a9a13e4bccf" as const;
export const GRAVITEE_SEQUENCE_LENGTH = 512 as const;
export const GRAVITEE_NATIVE_LABELS = ["not-toxic", "toxic"] as const;
export const GRAVITEE_POLICY_NAME = "GRAVITEE_PUBLISHER_ARGMAX_BASELINE_V1" as const;
export const GRAVITEE_SPECIAL_TOKEN_IDS = {
  pad: 0,
  unknown: 100,
  classification: 101,
  separator: 102,
  mask: 103,
} as const;

export interface GraviteeRuntimeMetadata {
  readonly artifactBytes: number;
  readonly artifactSha256: string;
  readonly tokenizerBytes: number;
  readonly tokenizerSha256: string;
  readonly configBytes: number;
  readonly configSha256: string;
  readonly modelLoadTimeMs: number;
  readonly rssBeforeLoadBytes: number;
  readonly rssAfterLoadBytes: number;
  readonly peakRssBytes: number;
  readonly cpu: string;
  readonly nodeVersion: string;
  readonly onnxRuntimeVersion: string;
  readonly tokenizerRuntimeVersion: string;
  readonly inputContract: string;
  readonly outputContract: string;
}

export interface GraviteeTokenizationObservation {
  readonly inputIds: readonly number[];
  readonly attentionMask: readonly number[];
  readonly typeIds: readonly number[];
  readonly specialTokensMask: readonly number[];
  readonly tokens: readonly string[];
}

export interface GraviteeInferenceObservation extends GraviteeTokenizationObservation {
  readonly tensorShape: readonly number[];
  readonly logits: readonly number[];
}

export interface GraviteeInferenceRuntime {
  initialize(): Promise<GraviteeRuntimeMetadata>;
  tokenize(text: string, paddingLength?: number): Promise<GraviteeTokenizationObservation>;
  infer(text: string): Promise<GraviteeInferenceObservation>;
  getPeakRssBytes(): number;
}

export interface GraviteeEvaluationProviderOptions {
  artifactDirectory?: string;
  runtime?: GraviteeInferenceRuntime;
}

const sha256File = (filePath: string): Promise<string> => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  stream.on("error", reject);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("end", () => resolve(hash.digest("hex")));
});

const packageVersion = (packageName: string): string => {
  try {
    return (require(`${packageName}/package.json`) as { version?: unknown }).version?.toString() ?? "unknown";
  } catch {
    return "unknown";
  }
};

export const defaultGraviteeArtifactDirectory = () => path.resolve(
  process.cwd(), "evaluation-cache", "text-moderation", "gravitee", GRAVITEE_MODEL_REVISION,
);

export class LocalGraviteeInferenceRuntime implements GraviteeInferenceRuntime {
  private readonly artifactDirectory: string;
  private tokenizer: Tokenizer | null = null;
  private session: ort.InferenceSession | null = null;
  private metadata: GraviteeRuntimeMetadata | null = null;
  private peakRssBytes = process.memoryUsage().rss;

  constructor(artifactDirectory = defaultGraviteeArtifactDirectory()) {
    this.artifactDirectory = path.resolve(artifactDirectory);
  }

  async initialize(): Promise<GraviteeRuntimeMetadata> {
    if (this.metadata) return this.metadata;
    const modelPath = path.join(this.artifactDirectory, GRAVITEE_ARTIFACT_NAME);
    const tokenizerPath = path.join(this.artifactDirectory, "tokenizer.json");
    const configPath = path.join(this.artifactDirectory, "config.json");
    const [modelStat, tokenizerStat, configStat, modelHash, tokenizerHash, configHash, configText] = await Promise.all([
      stat(modelPath), stat(tokenizerPath), stat(configPath), sha256File(modelPath), sha256File(tokenizerPath),
      sha256File(configPath), readFile(configPath, "utf8"),
    ]);
    if (modelStat.size !== GRAVITEE_ARTIFACT_BYTES || modelHash !== GRAVITEE_ARTIFACT_SHA256) {
      throw new Error(`Gravitee artifact identity mismatch: bytes=${modelStat.size}, sha256=${modelHash}`);
    }
    if (tokenizerHash !== GRAVITEE_TOKENIZER_SHA256) {
      throw new Error(`Gravitee tokenizer SHA-256 mismatch: ${tokenizerHash}`);
    }
    if (configHash !== GRAVITEE_CONFIG_SHA256) {
      throw new Error(`Gravitee config SHA-256 mismatch: ${configHash}`);
    }
    const config = JSON.parse(configText) as {
      architectures?: unknown;
      model_type?: unknown;
      problem_type?: unknown;
      max_position_embeddings?: unknown;
      id2label?: Record<string, unknown>;
    };
    if (!Array.isArray(config.architectures) || config.architectures[0] !== "DistilBertForSequenceClassification" ||
      config.model_type !== "distilbert" || config.problem_type !== "single_label_classification" ||
      config.max_position_embeddings !== GRAVITEE_SEQUENCE_LENGTH ||
      config.id2label?.["0"] !== GRAVITEE_NATIVE_LABELS[0] || config.id2label?.["1"] !== GRAVITEE_NATIVE_LABELS[1]) {
      throw new Error("Gravitee config does not match the pinned binary sequence-classification contract");
    }

    const rssBeforeLoadBytes = process.memoryUsage().rss;
    const startedAt = performance.now();
    this.tokenizer = Tokenizer.fromFile(tokenizerPath);
    this.tokenizer.setTruncation(GRAVITEE_SEQUENCE_LENGTH, {
      strategy: TruncationStrategy.LongestFirst,
      direction: "right",
      stride: 0,
    });
    this.tokenizer.disablePadding();
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    const modelLoadTimeMs = performance.now() - startedAt;
    if (this.session.inputNames.join(",") !== "input_ids,attention_mask" ||
      this.session.outputNames.join(",") !== "logits") {
      throw new Error("Gravitee ONNX input/output names are unexpected");
    }
    for (const input of this.session.inputMetadata) {
      if (!input.isTensor || input.type !== "int64" || input.shape.length !== 2 ||
        input.shape[0] !== "batch_size" || input.shape[1] !== "sequence_length") {
        throw new Error(`Gravitee ONNX input ${input.name} is not dynamic int64 [batch_size, sequence_length]`);
      }
    }
    const output = this.session.outputMetadata[0];
    if (!output || !output.isTensor || output.type !== "float32" ||
      output.shape.length !== 2 || output.shape[0] !== 1 || output.shape[1] !== 2) {
      throw new Error("Gravitee ONNX output metadata is not float32 [1, 2]");
    }
    const rssAfterLoadBytes = process.memoryUsage().rss;
    this.peakRssBytes = Math.max(this.peakRssBytes, rssBeforeLoadBytes, rssAfterLoadBytes);
    this.metadata = {
      artifactBytes: modelStat.size,
      artifactSha256: modelHash,
      tokenizerBytes: tokenizerStat.size,
      tokenizerSha256: tokenizerHash,
      configBytes: configStat.size,
      configSha256: configHash,
      modelLoadTimeMs,
      rssBeforeLoadBytes,
      rssAfterLoadBytes,
      peakRssBytes: this.peakRssBytes,
      cpu: os.cpus()[0]?.model ?? "unknown",
      nodeVersion: process.version,
      onnxRuntimeVersion: packageVersion("onnxruntime-node"),
      tokenizerRuntimeVersion: packageVersion("tokenizers"),
      inputContract: "input_ids:int64[batch_size,sequence_length],attention_mask:int64[batch_size,sequence_length]",
      outputContract: "logits:float32[1,2]",
    };
    return this.metadata;
  }

  async tokenize(text: string, paddingLength?: number): Promise<GraviteeTokenizationObservation> {
    if (!this.tokenizer) throw new Error("Gravitee runtime is not initialized");
    if (paddingLength !== undefined) {
      if (!Number.isInteger(paddingLength) || paddingLength < 2 || paddingLength > GRAVITEE_SEQUENCE_LENGTH) {
        throw new Error("Invalid diagnostic padding length");
      }
      this.tokenizer.setPadding({
        maxLength: paddingLength,
        direction: PaddingDirection.Right,
        padId: GRAVITEE_SPECIAL_TOKEN_IDS.pad,
        padTypeId: 0,
        padToken: "[PAD]",
      });
    } else {
      this.tokenizer.disablePadding();
    }
    try {
      const encoded = await this.tokenizer.encode(text);
      return {
        inputIds: encoded.getIds(),
        attentionMask: encoded.getAttentionMask(),
        typeIds: encoded.getTypeIds(),
        specialTokensMask: encoded.getSpecialTokensMask(),
        tokens: encoded.getTokens(),
      };
    } finally {
      if (paddingLength !== undefined) this.tokenizer.disablePadding();
    }
  }

  async infer(text: string): Promise<GraviteeInferenceObservation> {
    if (!this.session) throw new Error("Gravitee runtime is not initialized");
    const encoded = await this.tokenize(text);
    const { inputIds, attentionMask } = encoded;
    if (inputIds.length < 2 || inputIds.length > GRAVITEE_SEQUENCE_LENGTH ||
      inputIds.length !== attentionMask.length || inputIds[0] !== GRAVITEE_SPECIAL_TOKEN_IDS.classification ||
      inputIds[inputIds.length - 1] !== GRAVITEE_SPECIAL_TOKEN_IDS.separator ||
      attentionMask.some((value) => value !== 1)) {
      throw new Error("Gravitee tokenizer output violates the pinned batch-one dynamic-length contract");
    }
    const tensorShape = [1, inputIds.length];
    const outputs = await this.session.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(inputIds, (value) => BigInt(value)), tensorShape),
      attention_mask: new ort.Tensor("int64", BigInt64Array.from(attentionMask, (value) => BigInt(value)), tensorShape),
    });
    const logits = outputs.logits;
    if (!logits || logits.type !== "float32" || logits.data.length !== 2 ||
      logits.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 2) {
      throw new Error("Gravitee returned a malformed logits tensor");
    }
    this.peakRssBytes = Math.max(this.peakRssBytes, process.memoryUsage().rss);
    return { ...encoded, tensorShape, logits: Array.from(logits.data as Float32Array) };
  }

  getPeakRssBytes(): number {
    return this.peakRssBytes;
  }
}

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export const publisherSigmoidValues = (logits: readonly number[]): readonly [number, number] | null => {
  if (logits.length !== 2 || logits.some((value) => !Number.isFinite(value))) return null;
  const values: [number, number] = [sigmoid(logits[0]), sigmoid(logits[1])];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ? values : null;
};

export const diagnosticSoftmaxValues = (logits: readonly number[]): readonly [number, number] | null => {
  if (logits.length !== 2 || logits.some((value) => !Number.isFinite(value))) return null;
  const maximum = Math.max(logits[0], logits[1]);
  const first = Math.exp(logits[0] - maximum);
  const second = Math.exp(logits[1] - maximum);
  const denominator = first + second;
  const values: [number, number] = [first / denominator, second / denominator];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ? values : null;
};

export const graviteePublisherClassIndex = (logits: readonly number[]): 0 | 1 | null => {
  const scores = publisherSigmoidValues(logits);
  if (!scores) return null;
  return scores[1] > scores[0] ? 1 : 0;
};

export const evaluateGraviteeLogits = (logits: readonly number[]): ProviderEvaluationResult => {
  const publisherScores = publisherSigmoidValues(logits);
  const softmax = diagnosticSoftmaxValues(logits);
  const selectedIndex = graviteePublisherClassIndex(logits);
  if (!publisherScores || !softmax || selectedIndex === null) return {
    status: "ERROR",
    errorCode: "GRAVITEE_MALFORMED_OUTPUT",
    raw: { summary: "Gravitee returned missing or non-finite binary logits" },
  };
  const selectedClass = GRAVITEE_NATIVE_LABELS[selectedIndex];
  const decision = selectedIndex === 1 ? "BLOCK" as const : "ALLOW" as const;
  return {
    status: "COMPLETED",
    decision,
    raw: {
      summary: `${GRAVITEE_POLICY_NAME}: ${decision}; logits=[${logits.join(",")}]; publisherSigmoid=[${publisherScores.join(",")}]; diagnosticSoftmaxToxic=${softmax[1]}; selected=${selectedClass}`,
      labels: GRAVITEE_NATIVE_LABELS.map((name, index) => ({
        name,
        score: publisherScores[index],
        flagged: index === selectedIndex,
      })),
      metadata: {
        provider: "GRAVITEE",
        actualModel: `${GRAVITEE_MODEL_ID}@${GRAVITEE_MODEL_REVISION}`,
        evaluationPolicy: GRAVITEE_POLICY_NAME,
        notToxicLogit: logits[0],
        toxicLogit: logits[1],
        publisherNotToxicScore: publisherScores[0],
        publisherToxicScore: publisherScores[1],
        publisherScoreTransformation: "independent sigmoid per logit",
        diagnosticSoftmaxNotToxicProbability: softmax[0],
        diagnosticToxicProbability: softmax[1],
        selectedClass,
        decisionRule: "numpy-style argmax; first index wins exact tie",
        overallFlagged: decision === "BLOCK",
      },
    },
  };
};

export class GraviteeTextModerationEvaluationProvider implements TextModerationEvaluationProvider {
  readonly id = "GRAVITEE_DISTILBERT_BINARY_BASELINE_V1";
  readonly displayName = "Gravitee multilingual DistilBERT local ONNX QInt8";
  readonly requestedModel = `${GRAVITEE_MODEL_ID}@${GRAVITEE_MODEL_REVISION}`;

  private readonly runtime: GraviteeInferenceRuntime;
  private runtimeMetadata: GraviteeRuntimeMetadata | null = null;
  private initializationError = false;

  constructor(options: GraviteeEvaluationProviderOptions = {}) {
    this.runtime = options.runtime ?? new LocalGraviteeInferenceRuntime(options.artifactDirectory);
  }

  async initialize(): Promise<void> {
    if (this.runtimeMetadata) return;
    try {
      this.runtimeMetadata = await this.runtime.initialize();
    } catch (error) {
      this.initializationError = true;
      throw error;
    }
  }

  async inspect(text: string): Promise<GraviteeInferenceObservation> {
    if (!this.runtimeMetadata) await this.initialize();
    return this.runtime.infer(text);
  }

  async inspectTokenization(text: string, paddingLength?: number): Promise<GraviteeTokenizationObservation> {
    if (!this.runtimeMetadata) await this.initialize();
    return this.runtime.tokenize(text, paddingLength);
  }

  async evaluate(fixture: TextModerationEvaluationFixture): Promise<ProviderEvaluationResult> {
    if (!this.runtimeMetadata && !this.initializationError) {
      try { await this.initialize(); } catch { /* Converted to bounded unavailability below. */ }
    }
    if (!this.runtimeMetadata) return {
      status: "UNAVAILABLE",
      errorCode: "GRAVITEE_RUNTIME_UNAVAILABLE",
      raw: { summary: "Pinned local Gravitee artifacts could not be loaded" },
    };
    const startedAt = performance.now();
    try {
      const observation = await this.runtime.infer(fixture.text);
      const result = evaluateGraviteeLogits(observation.logits);
      if (!result.raw) return result;
      return {
        ...result,
        raw: {
          ...result.raw,
          metadata: {
            ...result.raw.metadata,
            activeTokenCount: observation.attentionMask.reduce((sum, value) => sum + value, 0),
            tensorShape: observation.tensorShape.join("x"),
            inferenceLatencyMs: performance.now() - startedAt,
          },
        },
      };
    } catch {
      return {
        status: "ERROR",
        errorCode: "GRAVITEE_INFERENCE_FAILED",
        raw: { summary: "Local Gravitee inference failed" },
      };
    }
  }

  getReportMetadata(): Readonly<Record<string, RawProviderScalar>> {
    const runtime = this.runtimeMetadata;
    return {
      upstreamModel: GRAVITEE_MODEL_ID,
      modelRevision: GRAVITEE_MODEL_REVISION,
      artifactName: GRAVITEE_ARTIFACT_NAME,
      modelLicense: "CreativeML Open RAIL++-M",
      productionLicenseStatus: "NOT YET ACCEPTED / REQUIRES LATER REVIEW",
      baseModel: "distilbert/distilbert-base-multilingual-cased",
      baseModelLicense: "Apache-2.0",
      architecture: "DistilBertForSequenceClassification; 135326210 parameters reported upstream",
      trainedOrEvaluatedLanguages: "en,ru,uk,de,es,am,zh,ar,hi,it,fr,he,ja,tt,Hinglish; Thai not claimed",
      nativeLabels: GRAVITEE_NATIVE_LABELS.join(","),
      outputSemantics: "two float32 logits [batch, not-toxic=0|toxic=1]",
      publisherTransformation: "independent sigmoid applied to each logit",
      decisionRule: "publisher argmax; toxic -> BLOCK, not-toxic -> ALLOW; no threshold",
      diagnosticProbability: "two-class softmax retained for analysis only; never used for decision",
      effectiveSequenceLength: GRAVITEE_SEQUENCE_LENGTH,
      tokenizer: "DistilBertTokenizer; WordPiece; tokenizer.json",
      specialTokens: "PAD=0,UNK=100,CLS=101,SEP=102,MASK=103",
      padding: "right when requested; disabled for batch-one inference",
      truncation: "right at 512 tokens including special tokens",
      executionProvider: "CPUExecutionProvider",
      gpuUsed: false,
      ...(runtime ? {
        artifactBytes: runtime.artifactBytes,
        artifactSha256: runtime.artifactSha256,
        tokenizerBytes: runtime.tokenizerBytes,
        tokenizerSha256: runtime.tokenizerSha256,
        configBytes: runtime.configBytes,
        configSha256: runtime.configSha256,
        modelLoadTimeMs: runtime.modelLoadTimeMs,
        rssBeforeLoadBytes: runtime.rssBeforeLoadBytes,
        rssAfterLoadBytes: runtime.rssAfterLoadBytes,
        peakRssBytes: this.runtime.getPeakRssBytes(),
        cpu: runtime.cpu,
        nodeVersion: runtime.nodeVersion,
        onnxRuntimeVersion: runtime.onnxRuntimeVersion,
        tokenizerRuntimeVersion: runtime.tokenizerRuntimeVersion,
        onnxInputs: runtime.inputContract,
        onnxOutput: runtime.outputContract,
      } : {}),
    };
  }
}
