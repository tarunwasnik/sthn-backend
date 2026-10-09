import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

import { ADAMCODD_RUNTIME_AUTHORITY, interpretAdamCoddLogits, preprocessAdamCodd, validateAdamCoddTensorContract } from "../../evaluation/imageModeration/adamCoddRuntimeAuthority";
import { adamCoddEvaluationDecision } from "../../evaluation/imageModeration/adamCoddFrozenEvaluation";
import { ADAMCODD_IMAGE_SAFETY_LIMITS, resolveAdamCoddModelPath } from "./adamCoddImageSafety.config";
import { AdamCoddImageSafetyResult } from "./adamCoddImageSafety.types";

type TensorMetadata = Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>;
type TensorOutput = Readonly<{ data: unknown; dispose?: () => void }>;
type AdamSession = Readonly<{
  inputMetadata: readonly TensorMetadata[];
  outputMetadata: readonly TensorMetadata[];
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, TensorOutput>>;
}>;
type AdamTensorFactory = (data: Float32Array) => ort.Tensor;

interface AdamCoddRuntimeDependencies {
  modelPath?: string | null;
  readArtifact?: (path: string) => Promise<Buffer>;
  createSession?: (artifact: Buffer) => Promise<AdamSession>;
  createTensor?: AdamTensorFactory;
}

const unavailable = (reasonCode: AdamCoddImageSafetyResult["reasonCode"]): AdamCoddImageSafetyResult => ({ decision: "UNAVAILABLE", reasonCode });
const disposeOutputs = (output: Record<string, TensorOutput>) => { for (const tensor of Object.values(output)) tensor.dispose?.(); };

const defaultCreateSession = async (artifact: Buffer): Promise<AdamSession> => {
  const session = await ort.InferenceSession.create(artifact, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  const tensorMetadata = (items: typeof session.inputMetadata): readonly TensorMetadata[] => items.map((item) => {
    if (!item.isTensor) throw new Error("AdamCodd ONNX metadata is not a tensor");
    return { name: item.name, type: item.type, shape: item.shape };
  });
  return {
    inputNames: session.inputNames, outputNames: session.outputNames,
    inputMetadata: tensorMetadata(session.inputMetadata), outputMetadata: tensorMetadata(session.outputMetadata),
    run: async (feeds) => {
      const output = await session.run(feeds);
      return Object.fromEntries(Object.entries(output).map(([name, tensor]) => [name, { data: tensor.data, dispose: () => tensor.dispose() }]));
    },
  };
};
const defaultCreateTensor: AdamTensorFactory = (data) => new ort.Tensor("float32", data, ADAMCODD_RUNTIME_AUTHORITY.inputShape);

export const verifyAdamCoddArtifactBytes = (artifact: Buffer): void => {
  if (artifact.length !== ADAMCODD_RUNTIME_AUTHORITY.artifactBytes || createHash("sha256").update(artifact).digest("hex") !== ADAMCODD_RUNTIME_AUTHORITY.artifactSha256) {
    throw new Error("AdamCodd artifact integrity validation failed");
  }
};

const assertAdamSessionContract = (session: AdamSession): void => {
  const input = session.inputMetadata[0]; const output = session.outputMetadata[0];
  if (session.inputNames.length !== 1 || session.outputNames.length !== 1 || !input || !output) throw new Error("AdamCodd ONNX tensor contract is invalid");
  validateAdamCoddTensorContract(input, output);
};

const assertInputIsSafeToDecode = async (bytes: Buffer): Promise<void> => {
  if (!bytes.length || bytes.length > ADAMCODD_IMAGE_SAFETY_LIMITS.maxBytes) throw new Error("Image byte limit exceeded");
  const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels, pages: 1, animated: false }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > ADAMCODD_IMAGE_SAFETY_LIMITS.maxWidth || metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxHeight || metadata.width * metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1)) {
    throw new Error("Image decode limits exceeded");
  }
};

class BoundedInferenceGate {
  private running = 0;
  private readonly waiters: Array<() => void> = [];
  async enter(): Promise<boolean> {
    if (this.running < ADAMCODD_IMAGE_SAFETY_LIMITS.maxConcurrentInferences) { this.running += 1; return true; }
    if (this.waiters.length >= ADAMCODD_IMAGE_SAFETY_LIMITS.maxQueuedInferences) return false;
    await new Promise<void>((resolve) => this.waiters.push(resolve)); return true;
  }
  leave(): void { const next = this.waiters.shift(); if (next) next(); else this.running -= 1; }
}

/** Backend-only frozen Adam runtime. It accepts bytes, never URLs, and emits only bounded STHN decisions. */
export class AdamCoddImageSafetyService {
  private sessionPromise: Promise<AdamSession> | null = null;
  private readonly gate = new BoundedInferenceGate();
  private readonly modelPath: string | null;
  private readonly readArtifact: (path: string) => Promise<Buffer>;
  private readonly createSession: (artifact: Buffer) => Promise<AdamSession>;
  private readonly createTensor: AdamTensorFactory;

  constructor(dependencies: AdamCoddRuntimeDependencies = {}) {
    this.modelPath = dependencies.modelPath === undefined ? resolveAdamCoddModelPath() : dependencies.modelPath;
    this.readArtifact = dependencies.readArtifact ?? readFile;
    this.createSession = dependencies.createSession ?? defaultCreateSession;
    this.createTensor = dependencies.createTensor ?? defaultCreateTensor;
  }

  private async session(): Promise<AdamSession> {
    if (!this.modelPath) throw new Error("AdamCodd production artifact is not configured");
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const artifact = await this.readArtifact(this.modelPath!);
        verifyAdamCoddArtifactBytes(artifact);
        const session = await this.createSession(artifact);
        assertAdamSessionContract(session);
        return session;
      })();
    }
    try { return await this.sessionPromise; } catch (error) { this.sessionPromise = null; throw error; }
  }

  async classify(bytes: Buffer): Promise<AdamCoddImageSafetyResult> {
    try { await assertInputIsSafeToDecode(bytes); } catch { return unavailable("INVALID_IMAGE"); }
    const entered = await this.gate.enter();
    if (!entered) return unavailable("IMAGE_SAFETY_UNAVAILABLE");
    try {
      const input = await preprocessAdamCodd(bytes);
      const tensor = this.createTensor(input.data);
      try {
        const output = await (await this.session()).run({ [ADAMCODD_RUNTIME_AUTHORITY.inputName]: tensor });
        try {
          const logits = output[ADAMCODD_RUNTIME_AUTHORITY.outputName]?.data;
          if (!(logits instanceof Float32Array) || logits.length !== 2) throw new Error("AdamCodd output is invalid");
          const decision = adamCoddEvaluationDecision(interpretAdamCoddLogits([...logits]).nativeClass);
          return decision === "PASS" ? { decision: "PASS", reasonCode: "IMAGE_POLICY" } : { decision: "BLOCK", reasonCode: "IMAGE_POLICY" };
        } finally { disposeOutputs(output); }
      } finally { tensor.dispose?.(); }
    } catch { return unavailable("IMAGE_SAFETY_UNAVAILABLE"); } finally { this.gate.leave(); }
  }
}

/** One process-wide reusable instance for future admission services. */
export const adamCoddImageSafetyService = new AdamCoddImageSafetyService();
