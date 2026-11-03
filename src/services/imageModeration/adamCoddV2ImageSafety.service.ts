import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import * as ort from "onnxruntime-node";

import { ADAMCODD_V2_RUNTIME_AUTHORITY, validateAdamCoddV2TensorContract } from "../../evaluation/imageModeration/adamCoddV2RuntimeAuthority";
import { ADAMCODD_IMAGE_SAFETY_LIMITS, resolveAdamCoddV2ModelPath } from "./adamCoddImageSafety.config";
import { AdamCoddImageSafetyResult } from "./adamCoddImageSafety.types";
import { AdamCoddV2PreprocessingService, adamCoddV2PreprocessingService } from "./adamCoddV2Preprocessing.service";

export type AdamCoddV2PipelineClassificationObserver = (diagnostic: never) => void;
export type AdamCoddPipelineProvenance = Readonly<{
  pipeline: "V2";
  modelIdentifier: string;
  modelRevision: string;
  artifactSha256: string;
  preprocessingId: string;
  decisionRuleId: string;
  threshold: number;
}>;

type TensorMetadata = Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>;
export type AdamCoddV2TensorOutput = Readonly<{ data: unknown; dispose?: () => void }>;
export type AdamCoddV2Session = Readonly<{
  inputMetadata: readonly TensorMetadata[];
  outputMetadata: readonly TensorMetadata[];
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, AdamCoddV2TensorOutput>>;
}>;

/** Internal-only instrumentation seam for local runtime qualification. */
export type AdamCoddV2RuntimeObserver = Readonly<{
  onModelSessionReady?: (durationMs: number) => void;
  onPreprocessingComplete?: (durationMs: number) => void;
  onInferenceComplete?: (durationMs: number) => void;
  /** Internal-only gate telemetry for disposable qualification workers. */
  onInferenceGate?: (event: "ACTIVE" | "QUEUED" | "REJECTED" | "RELEASED") => void;
}>;

type AdamCoddV2TensorFactory = (data: Float32Array) => ort.Tensor;
type AdamCoddV2SessionTuning = Readonly<{ intraOpNumThreads?: number; interOpNumThreads?: number }>;
type AdamCoddV2InferenceCapacity = Readonly<{ maxConcurrent: number; maxQueued: number }>;
type AdamCoddV2Dependencies = Readonly<{
  modelPath?: string | null;
  readArtifact?: (path: string) => Promise<Buffer>;
  verifyArtifact?: (artifact: Buffer) => void;
  createSession?: (artifact: Buffer) => Promise<AdamCoddV2Session>;
  createTensor?: AdamCoddV2TensorFactory;
  preprocessor?: Pick<AdamCoddV2PreprocessingService, "preprocessOriginal">;
  observer?: AdamCoddV2RuntimeObserver;
  /** Test-only/local-qualification overrides. Production continues to use defaults. */
  sessionTuning?: AdamCoddV2SessionTuning;
  /** Test-only/local-qualification overrides. Production continues to use defaults. */
  inferenceCapacity?: AdamCoddV2InferenceCapacity;
}>;

const unavailable = (reasonCode: AdamCoddImageSafetyResult["reasonCode"]): AdamCoddImageSafetyResult => ({ decision: "UNAVAILABLE", reasonCode });
const disposeOutputs = (output: Record<string, AdamCoddV2TensorOutput>) => { for (const tensor of Object.values(output)) tensor.dispose?.(); };
/** Stable two-class softmax kept beside the V2 runtime so production has no V1 authority dependency. */
export const softmaxAdamCoddV2Logits = (logits: readonly number[]): readonly number[] => {
  if (logits.length !== 2 || logits.some((value) => !Number.isFinite(value))) throw new Error("AdamCodd V2 logits must be two finite values");
  const largest = Math.max(...logits); const exponentials = logits.map((value) => Math.exp(value - largest)); const denominator = exponentials[0]! + exponentials[1]!;
  if (!Number.isFinite(denominator) || denominator <= 0) throw new Error("AdamCodd V2 softmax denominator is invalid");
  const probabilities = exponentials.map((value) => value / denominator);
  if (probabilities.some((value) => !Number.isFinite(value))) throw new Error("AdamCodd V2 probabilities are non-finite");
  return probabilities;
};

export const ADAMCODD_V2_PIPELINE_PROVENANCE: AdamCoddPipelineProvenance = Object.freeze({
  pipeline: "V2",
  modelIdentifier: ADAMCODD_V2_RUNTIME_AUTHORITY.modelIdentifier,
  modelRevision: ADAMCODD_V2_RUNTIME_AUTHORITY.revision,
  artifactSha256: ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256,
  preprocessingId: ADAMCODD_V2_RUNTIME_AUTHORITY.preprocessingId,
  decisionRuleId: ADAMCODD_V2_RUNTIME_AUTHORITY.decisionRuleId,
  threshold: ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold,
});

export const verifyAdamCoddV2ArtifactBytes = (artifact: Buffer): void => {
  if (artifact.length !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactBytes
    || createHash("sha256").update(artifact).digest("hex") !== ADAMCODD_V2_RUNTIME_AUTHORITY.artifactSha256) {
    throw new Error("AdamCodd V2 artifact integrity validation failed");
  }
};

export const adamCoddV2DecisionFromNsfwProbability = (nsfwProbability: number): "PASS" | "BLOCK" => {
  if (!Number.isFinite(nsfwProbability) || nsfwProbability < 0 || nsfwProbability > 1) throw new Error("AdamCodd V2 NSFW probability is invalid");
  return nsfwProbability >= ADAMCODD_V2_RUNTIME_AUTHORITY.nsfwBlockThreshold ? "BLOCK" : "PASS";
};

const assertV2SessionContract = (session: AdamCoddV2Session): void => {
  const input = session.inputMetadata[0];
  const output = session.outputMetadata[0];
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1 || !input || !output) throw new Error("AdamCodd V2 ONNX tensor contract is invalid");
  validateAdamCoddV2TensorContract(input, output);
};

const defaultCreateSession = async (artifact: Buffer, tuning: AdamCoddV2SessionTuning = {}): Promise<AdamCoddV2Session> => {
  const session = await ort.InferenceSession.create(artifact, {
    executionProviders: ["cpu"],
    enableCpuMemArena: false,
    enableMemPattern: false,
    ...tuning,
  });
  const metadata = (items: typeof session.inputMetadata): readonly TensorMetadata[] => items.map((item) => {
    if (!item.isTensor) throw new Error("AdamCodd V2 ONNX metadata is not a tensor");
    return { name: item.name, type: item.type, shape: item.shape };
  });
  return {
    inputNames: session.inputNames,
    outputNames: session.outputNames,
    inputMetadata: metadata(session.inputMetadata),
    outputMetadata: metadata(session.outputMetadata),
    run: async (feeds) => {
      const output = await session.run(feeds);
      return Object.fromEntries(Object.entries(output).map(([name, tensor]) => [name, { data: tensor.data, dispose: () => tensor.dispose() }]));
    },
  };
};

class BoundedInferenceGate {
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number, private readonly maximumQueued: number) {}

  async enter(): Promise<"ACTIVE" | "QUEUED" | "REJECTED"> {
    if (this.running < this.maximum) {
      this.running += 1;
      return "ACTIVE";
    }
    if (this.waiters.length >= this.maximumQueued) return "REJECTED";
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return "QUEUED";
  }

  leave(): void {
    const next = this.waiters.shift();
    if (next) next(); else this.running -= 1;
  }
}

/**
 * Server-selected V2 runtime. It never falls back to V1; callers receive only
 * the existing bounded safety result.
 */
export class AdamCoddV2ImageSafetyService {
  readonly kind = "V2" as const;
  readonly inputKind = "VALIDATED_ORIGINAL_BYTES" as const;
  readonly provenance = ADAMCODD_V2_PIPELINE_PROVENANCE;

  private sessionPromise: Promise<AdamCoddV2Session> | null = null;
  private readonly gate: BoundedInferenceGate;
  private readonly modelPath: string | null;
  private readonly readArtifact: (path: string) => Promise<Buffer>;
  private readonly verifyArtifact: (artifact: Buffer) => void;
  private readonly createSession: (artifact: Buffer) => Promise<AdamCoddV2Session>;
  private readonly createTensor: AdamCoddV2TensorFactory;
  private readonly preprocessor: Pick<AdamCoddV2PreprocessingService, "preprocessOriginal">;
  private readonly observer?: AdamCoddV2RuntimeObserver;

  constructor(dependencies: AdamCoddV2Dependencies = {}) {
    this.modelPath = dependencies.modelPath === undefined ? resolveAdamCoddV2ModelPath() : dependencies.modelPath;
    this.readArtifact = dependencies.readArtifact ?? readFile;
    this.verifyArtifact = dependencies.verifyArtifact ?? verifyAdamCoddV2ArtifactBytes;
    const tuning = dependencies.sessionTuning ?? {};
    if ((tuning.intraOpNumThreads !== undefined && (!Number.isInteger(tuning.intraOpNumThreads) || tuning.intraOpNumThreads < 1))
      || (tuning.interOpNumThreads !== undefined && (!Number.isInteger(tuning.interOpNumThreads) || tuning.interOpNumThreads < 1))) throw new Error("AdamCodd V2 session thread tuning is invalid");
    const capacity = dependencies.inferenceCapacity ?? { maxConcurrent: ADAMCODD_IMAGE_SAFETY_LIMITS.maxConcurrentInferences, maxQueued: ADAMCODD_IMAGE_SAFETY_LIMITS.maxQueuedInferences };
    if (!Number.isInteger(capacity.maxConcurrent) || capacity.maxConcurrent < 1 || !Number.isInteger(capacity.maxQueued) || capacity.maxQueued < 0) throw new Error("AdamCodd V2 inference capacity is invalid");
    this.gate = new BoundedInferenceGate(capacity.maxConcurrent, capacity.maxQueued);
    this.createSession = dependencies.createSession ?? ((artifact) => defaultCreateSession(artifact, tuning));
    this.createTensor = dependencies.createTensor ?? ((data) => new ort.Tensor("float32", data, ADAMCODD_V2_RUNTIME_AUTHORITY.inputShape));
    this.preprocessor = dependencies.preprocessor ?? adamCoddV2PreprocessingService;
    this.observer = dependencies.observer;
  }

  private async session(): Promise<AdamCoddV2Session> {
    if (!this.modelPath) throw new Error("AdamCodd V2 artifact is not configured");
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const startedAt = performance.now();
        const artifact = await this.readArtifact(this.modelPath!);
        this.verifyArtifact(artifact);
        const session = await this.createSession(artifact);
        assertV2SessionContract(session);
        this.observer?.onModelSessionReady?.(performance.now() - startedAt);
        return session;
      })();
    }
    try {
      return await this.sessionPromise;
    } catch (error) {
      this.sessionPromise = null;
      throw error;
    }
  }

  async classify(bytes: Buffer, _observe?: AdamCoddV2PipelineClassificationObserver): Promise<AdamCoddImageSafetyResult> {
    const gateState = await this.gate.enter();
    this.observer?.onInferenceGate?.(gateState);
    if (gateState === "REJECTED") return unavailable("IMAGE_SAFETY_UNAVAILABLE");
    try {
      let input;
      try {
        const startedAt = performance.now();
        input = await this.preprocessor.preprocessOriginal(bytes);
        this.observer?.onPreprocessingComplete?.(performance.now() - startedAt);
      } catch {
        return unavailable("INVALID_IMAGE");
      }
      const tensor = this.createTensor(input.data);
      try {
        const session = await this.session();
        const startedAt = performance.now();
        const output = await session.run({ [ADAMCODD_V2_RUNTIME_AUTHORITY.inputName]: tensor });
        this.observer?.onInferenceComplete?.(performance.now() - startedAt);
        try {
          const logits = output[ADAMCODD_V2_RUNTIME_AUTHORITY.outputName]?.data;
          if (!(logits instanceof Float32Array) || logits.length !== 2) throw new Error("AdamCodd V2 output is invalid");
          const probabilities = softmaxAdamCoddV2Logits([...logits]);
          const nsfwProbability = probabilities[1];
          if (nsfwProbability === undefined) throw new Error("AdamCodd V2 output is invalid");
          const decision = adamCoddV2DecisionFromNsfwProbability(nsfwProbability);
          return { decision, reasonCode: "IMAGE_POLICY" };
        } finally {
          disposeOutputs(output);
        }
      } finally {
        tensor.dispose?.();
      }
    } catch {
      return unavailable("IMAGE_SAFETY_UNAVAILABLE");
    } finally {
      this.gate.leave();
      this.observer?.onInferenceGate?.("RELEASED");
    }
  }
}

/** One process-wide candidate instance for a later, explicitly approved integration stage. */
export const adamCoddV2ImageSafetyService = new AdamCoddV2ImageSafetyService();
