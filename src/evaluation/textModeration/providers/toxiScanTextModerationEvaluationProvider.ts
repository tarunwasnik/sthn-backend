import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import * as ort from "onnxruntime-node";
import { Tokenizer } from "tokenizers";

import {
  BoundedRawProviderDetails,
  EvaluationPolicyCategory,
  ProviderEvaluationResult,
  RawProviderScalar,
  TextModerationEvaluationFixture,
  TextModerationEvaluationProvider,
} from "../textModerationEvaluation.types";

export const TOXISCAN_MODEL_ID = "vectorsense/toxiscan" as const;
export const TOXISCAN_MODEL_REVISION = "2a9a11f5275c3254effe8c8208c60f6aff53146f" as const;
export const TOXISCAN_ARTIFACT_NAME = "toxiscan.onnx" as const;
export const TOXISCAN_ARTIFACT_SHA256 = "5683dd7ea12a3a6d811610c8d7562427f5b4e8a0d586def8df70e7de603e4509" as const;
export const TOXISCAN_POLICY_NAME = "STHN_TOXISCAN_NEUTRAL_BASELINE_V1" as const;
export const TOXISCAN_THRESHOLD = 0.5 as const;
export const TOXISCAN_SEQUENCE_LENGTH = 192 as const;

export const TOXISCAN_NATIVE_LABELS = [
  "insult",
  "threat",
  "identity_hate",
  "sexual",
  "self_harm",
  "harassment",
  "profanity",
  "spam",
] as const;

export type ToxiScanNativeLabel = typeof TOXISCAN_NATIVE_LABELS[number];

export const TOXISCAN_DECISION_LABELS = [
  "insult",
  "threat",
  "identity_hate",
  "sexual",
  "harassment",
  "profanity",
] as const satisfies readonly ToxiScanNativeLabel[];

const DECISION_LABELS = new Set<ToxiScanNativeLabel>(TOXISCAN_DECISION_LABELS);
const CATEGORY_BY_LABEL: Readonly<Partial<Record<ToxiScanNativeLabel, EvaluationPolicyCategory>>> = {
  profanity: "PROFANITY",
  sexual: "SEXUAL",
  identity_hate: "HATE",
  threat: "THREAT_OR_VIOLENCE",
  harassment: "ABUSIVE_OR_HARASSING",
  insult: "ABUSIVE_OR_HARASSING",
};

export interface ToxiScanRuntimeMetadata {
  readonly artifactBytes: number;
  readonly artifactSha256: string;
  readonly tokenizerBytes: number;
  readonly tokenizerSha256: string;
  readonly modelLoadTimeMs: number;
  readonly rssBeforeLoadBytes: number;
  readonly rssAfterLoadBytes: number;
  readonly peakRssBytes: number;
  readonly cpu: string;
  readonly nodeVersion: string;
  readonly onnxRuntimeVersion: string;
  readonly tokenizerRuntimeVersion: string;
}

export interface ToxiScanInferenceRuntime {
  initialize(): Promise<ToxiScanRuntimeMetadata>;
  infer(text: string): Promise<readonly number[]>;
  getPeakRssBytes(): number;
}

export interface ToxiScanEvaluationProviderOptions {
  artifactDirectory?: string;
  runtime?: ToxiScanInferenceRuntime;
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

export const defaultToxiScanArtifactDirectory = () => path.resolve(
  process.cwd(),
  "evaluation-cache",
  "text-moderation",
  "toxiscan",
  TOXISCAN_MODEL_REVISION,
);

export class LocalToxiScanInferenceRuntime implements ToxiScanInferenceRuntime {
  private readonly artifactDirectory: string;
  private tokenizer: Tokenizer | null = null;
  private session: ort.InferenceSession | null = null;
  private metadata: ToxiScanRuntimeMetadata | null = null;
  private peakRssBytes = process.memoryUsage().rss;

  constructor(artifactDirectory = defaultToxiScanArtifactDirectory()) {
    this.artifactDirectory = path.resolve(artifactDirectory);
  }

  async initialize(): Promise<ToxiScanRuntimeMetadata> {
    if (this.metadata) return this.metadata;
    const modelPath = path.join(this.artifactDirectory, TOXISCAN_ARTIFACT_NAME);
    const tokenizerPath = path.join(this.artifactDirectory, "tokenizer.json");
    const labelsPath = path.join(this.artifactDirectory, "labels.json");
    const [modelStat, tokenizerStat, modelHash, tokenizerHash, labelsText] = await Promise.all([
      stat(modelPath),
      stat(tokenizerPath),
      sha256File(modelPath),
      sha256File(tokenizerPath),
      readFile(labelsPath, "utf8"),
    ]);
    if (modelHash !== TOXISCAN_ARTIFACT_SHA256) {
      throw new Error(`ToxiScan artifact SHA-256 mismatch: ${modelHash}`);
    }
    const labels = JSON.parse(labelsText) as unknown;
    if (!Array.isArray(labels) || labels.length !== TOXISCAN_NATIVE_LABELS.length ||
      labels.some((label, index) => label !== TOXISCAN_NATIVE_LABELS[index])) {
      throw new Error("ToxiScan labels.json does not match the pinned native label order");
    }

    const rssBeforeLoadBytes = process.memoryUsage().rss;
    const startedAt = performance.now();
    this.tokenizer = Tokenizer.fromFile(tokenizerPath);
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    const modelLoadTimeMs = performance.now() - startedAt;
    if (this.session.inputNames.join(",") !== "input_ids,attention_mask" ||
      this.session.outputNames.join(",") !== "logits") {
      throw new Error("ToxiScan ONNX input/output contract is unexpected");
    }
    const rssAfterLoadBytes = process.memoryUsage().rss;
    this.peakRssBytes = Math.max(this.peakRssBytes, rssBeforeLoadBytes, rssAfterLoadBytes);
    this.metadata = {
      artifactBytes: modelStat.size,
      artifactSha256: modelHash,
      tokenizerBytes: tokenizerStat.size,
      tokenizerSha256: tokenizerHash,
      modelLoadTimeMs,
      rssBeforeLoadBytes,
      rssAfterLoadBytes,
      peakRssBytes: this.peakRssBytes,
      cpu: os.cpus()[0]?.model ?? "unknown",
      nodeVersion: process.version,
      onnxRuntimeVersion: packageVersion("onnxruntime-node"),
      tokenizerRuntimeVersion: packageVersion("tokenizers"),
    };
    return this.metadata;
  }

  async infer(text: string): Promise<readonly number[]> {
    if (!this.tokenizer || !this.session) throw new Error("ToxiScan runtime is not initialized");
    const encoded = await this.tokenizer.encode(text);
    const ids = encoded.getIds();
    const attentionMask = encoded.getAttentionMask();
    if (ids.length !== TOXISCAN_SEQUENCE_LENGTH || attentionMask.length !== TOXISCAN_SEQUENCE_LENGTH) {
      throw new Error("ToxiScan tokenizer did not apply its pinned 192-token padding/truncation contract");
    }
    const dimensions = [1, ids.length];
    const output = await this.session.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, (value) => BigInt(value)), dimensions),
      attention_mask: new ort.Tensor("int64", BigInt64Array.from(attentionMask, (value) => BigInt(value)), dimensions),
    });
    const logits = output.logits;
    if (!logits || logits.type !== "float32" || logits.data.length !== TOXISCAN_NATIVE_LABELS.length) {
      throw new Error("ToxiScan returned a malformed logits tensor");
    }
    this.peakRssBytes = Math.max(this.peakRssBytes, process.memoryUsage().rss);
    return Array.from(logits.data as Float32Array);
  }

  getPeakRssBytes(): number {
    return this.peakRssBytes;
  }
}

const sigmoid = (logit: number) => 1 / (1 + Math.exp(-logit));

export const evaluateToxiScanLogits = (logits: readonly number[]): ProviderEvaluationResult => {
  if (logits.length !== TOXISCAN_NATIVE_LABELS.length || logits.some((value) => !Number.isFinite(value))) {
    return {
      status: "ERROR",
      errorCode: "TOXISCAN_MALFORMED_OUTPUT",
      raw: { summary: "ToxiScan returned missing or non-finite logits" },
    };
  }
  const probabilities = logits.map(sigmoid);
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    return {
      status: "ERROR",
      errorCode: "TOXISCAN_MALFORMED_OUTPUT",
      raw: { summary: "ToxiScan sigmoid conversion produced an invalid probability" },
    };
  }
  const crossed = TOXISCAN_NATIVE_LABELS.filter((label, index) =>
    DECISION_LABELS.has(label) && probabilities[index] >= TOXISCAN_THRESHOLD,
  );
  const categories = [...new Set(crossed.flatMap((label) => {
    const category = CATEGORY_BY_LABEL[label];
    return category ? [category] : [];
  }))];
  const labels: NonNullable<BoundedRawProviderDetails["labels"]> = TOXISCAN_NATIVE_LABELS.map((name, index) => ({
    name,
    score: probabilities[index],
    flagged: DECISION_LABELS.has(name) ? probabilities[index] >= TOXISCAN_THRESHOLD : null,
  }));
  return {
    status: "COMPLETED",
    decision: crossed.length ? "BLOCK" : "ALLOW",
    categories,
    raw: {
      summary: `${TOXISCAN_POLICY_NAME}: ${crossed.length ? "BLOCK" : "ALLOW"}`,
      labels,
      metadata: {
        provider: "TOXISCAN",
        actualModel: `${TOXISCAN_MODEL_ID}@${TOXISCAN_MODEL_REVISION}`,
        evaluationPolicy: TOXISCAN_POLICY_NAME,
        threshold: TOXISCAN_THRESHOLD,
        thresholdSource: "publisher evaluation threshold 0.50",
        binaryAggregation: "STHN-authored any-of-six",
        crossedDecisionLabels: crossed.join(",") || "none",
        observationOnlyLabels: "self_harm,spam",
        overallFlagged: crossed.length > 0,
      },
    },
  };
};

export class ToxiScanTextModerationEvaluationProvider implements TextModerationEvaluationProvider {
  readonly id = "TOXISCAN_STHN_NEUTRAL_BASELINE_V1";
  readonly displayName = "ToxiScan local ONNX";
  readonly requestedModel = `${TOXISCAN_MODEL_ID}@${TOXISCAN_MODEL_REVISION}`;

  private readonly runtime: ToxiScanInferenceRuntime;
  private runtimeMetadata: ToxiScanRuntimeMetadata | null = null;
  private initializationError = false;

  constructor(options: ToxiScanEvaluationProviderOptions = {}) {
    this.runtime = options.runtime ?? new LocalToxiScanInferenceRuntime(options.artifactDirectory);
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

  async evaluate(_fixture: TextModerationEvaluationFixture): Promise<ProviderEvaluationResult> {
    if (!this.runtimeMetadata && !this.initializationError) {
      try {
        await this.initialize();
      } catch {
        // Converted to the bounded availability result below.
      }
    }
    if (!this.runtimeMetadata) {
      return {
        status: "UNAVAILABLE",
        errorCode: "TOXISCAN_RUNTIME_UNAVAILABLE",
        raw: { summary: "Pinned local ToxiScan artifacts could not be loaded" },
      };
    }
    const startedAt = performance.now();
    try {
      const logits = await this.runtime.infer(_fixture.text);
      const result = evaluateToxiScanLogits(logits);
      const inferenceLatencyMs = performance.now() - startedAt;
      if (!result.raw) return result;
      return {
        ...result,
        raw: {
          ...result.raw,
          metadata: { ...result.raw.metadata, inferenceLatencyMs },
        },
      };
    } catch {
      return {
        status: "ERROR",
        errorCode: "TOXISCAN_INFERENCE_FAILED",
        raw: { summary: "Local ToxiScan inference failed" },
      };
    }
  }

  getReportMetadata(): Readonly<Record<string, RawProviderScalar>> {
    const runtime = this.runtimeMetadata;
    return {
      upstreamModel: TOXISCAN_MODEL_ID,
      modelRevision: TOXISCAN_MODEL_REVISION,
      artifactName: TOXISCAN_ARTIFACT_NAME,
      evaluationPolicy: TOXISCAN_POLICY_NAME,
      threshold: TOXISCAN_THRESHOLD,
      thresholdSource: "publisher evaluation threshold 0.50",
      binaryAggregation: "STHN-authored: BLOCK when any decision label is >= 0.50",
      decisionLabels: TOXISCAN_DECISION_LABELS.join(","),
      observationOnlyLabels: "self_harm,spam",
      effectiveSequenceLength: TOXISCAN_SEQUENCE_LENGTH,
      executionProvider: "CPUExecutionProvider",
      gpuUsed: false,
      ...(runtime ? {
        artifactBytes: runtime.artifactBytes,
        artifactSha256: runtime.artifactSha256,
        tokenizerBytes: runtime.tokenizerBytes,
        tokenizerSha256: runtime.tokenizerSha256,
        modelLoadTimeMs: runtime.modelLoadTimeMs,
        rssBeforeLoadBytes: runtime.rssBeforeLoadBytes,
        rssAfterLoadBytes: runtime.rssAfterLoadBytes,
        peakRssBytes: this.runtime.getPeakRssBytes(),
        cpu: runtime.cpu,
        nodeVersion: runtime.nodeVersion,
        onnxRuntimeVersion: runtime.onnxRuntimeVersion,
        tokenizerRuntimeVersion: runtime.tokenizerRuntimeVersion,
      } : {}),
    };
  }
}
