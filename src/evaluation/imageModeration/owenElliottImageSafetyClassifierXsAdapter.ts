import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";

/** Evaluation-only identity for the immutable artifact used by I4-B1. */
export const OWEN_ELLIOTT_XS_ARTIFACT = Object.freeze({
  repositoryId: "OwenElliott/image-safety-classifier-xs",
  artifactRevision: "606ad3dfd6a023215e3ab0797040437cc365977b",
  modelCardRevision: "606ad3dfd6a023215e3ab0797040437cc365977b",
  artifactPath: "onnx/image-safety-classifier-xs.onnx",
  bytes: 13_137_569,
  sha256: "8c28c49d9075f3ad15ebdc2961f02d5b3f99be944815b848b49c9f0e6f3fb689",
  nativeClassOrder: ["NSFL", "NSFW", "SFW"] as const,
  baselineVersion: "OWEN_ELLIOTT_XS_BASELINE_V1",
});

export type OwenElliottNativeClass = (typeof OWEN_ELLIOTT_XS_ARTIFACT.nativeClassOrder)[number];
export type OwenElliottDecision = "PASS" | "BLOCK";
export type OwenElliottSessionMetadata = Readonly<{ inputName: string; inputType: string; inputShape: readonly (string | number)[]; outputName: string; outputType: string; outputShape: readonly (string | number)[] }>;
type RuntimeSession = Pick<ort.InferenceSession, "inputNames" | "outputNames" | "inputMetadata" | "outputMetadata" | "run">;

const validInputShape = (shape: readonly (string | number)[]) => shape.length === 4 && [1, "batch_size"].includes(shape[0]) && shape.slice(1).join(",") === "3,224,224";
const validOutputShape = (shape: readonly (string | number)[]) => shape.length === 2 && [1, "batch_size"].includes(shape[0]) && shape[1] === 3;

export const owenElliottDecisionForNativeClass = (value: OwenElliottNativeClass): OwenElliottDecision => value === "SFW" ? "PASS" : "BLOCK";

/** Documented ONNX preprocessing: RGB, bilinear 224-square resize, 0-255 float32 NCHW. The graph owns normalization. */
export const createOwenElliottXsInput = async (bytes: Buffer): Promise<Float32Array> => {
  const pixels = await sharp(bytes, { failOn: "error" }).resize(224, 224, { fit: "fill", kernel: sharp.kernel.linear }).removeAlpha().raw().toBuffer();
  if (pixels.length !== 224 * 224 * 3) throw new Error("Image preprocessing produced an invalid RGB buffer");
  const plane = 224 * 224;
  const data = new Float32Array(plane * 3);
  for (let pixel = 0; pixel < plane; pixel += 1) { data[pixel] = pixels[pixel * 3]; data[plane + pixel] = pixels[pixel * 3 + 1]; data[(plane * 2) + pixel] = pixels[pixel * 3 + 2]; }
  return data;
};

const inspectSession = (session: RuntimeSession): OwenElliottSessionMetadata => {
  const input = session.inputMetadata[0]; const output = session.outputMetadata[0];
  if (session.inputNames.length !== 1 || session.inputNames[0] !== "image" || !input?.isTensor || input.type !== "float32" || !validInputShape(input.shape)
    || session.outputNames.length !== 1 || session.outputNames[0] !== "probabilities" || !output?.isTensor || output.type !== "float32" || !validOutputShape(output.shape)) throw new Error("OwenElliott XS ONNX tensor contract is invalid");
  return { inputName: session.inputNames[0], inputType: input.type, inputShape: input.shape, outputName: session.outputNames[0], outputType: output.type, outputShape: output.shape };
};

export class OwenElliottImageSafetyClassifierXsAdapter {
  private session: RuntimeSession | null = null;
  private metadata: OwenElliottSessionMetadata | null = null;
  public constructor(private readonly artifactFile = path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs", "image-safety-classifier-xs.onnx"), private readonly loadSession: (bytes: Buffer) => Promise<RuntimeSession> = (bytes) => ort.InferenceSession.create(bytes, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false })) {}

  public async initialize(): Promise<OwenElliottSessionMetadata> {
    if (this.session && this.metadata) return this.metadata;
    const bytes = await readFile(this.artifactFile);
    if (bytes.length !== OWEN_ELLIOTT_XS_ARTIFACT.bytes || createHash("sha256").update(bytes).digest("hex") !== OWEN_ELLIOTT_XS_ARTIFACT.sha256) throw new Error("OwenElliott XS model artifact integrity validation failed");
    const session = await this.loadSession(bytes); const metadata = inspectSession(session);
    this.session = session; this.metadata = metadata; return metadata;
  }

  public async classify(bytes: Buffer): Promise<Readonly<{ nativeClass: OwenElliottNativeClass; decision: OwenElliottDecision; scores: readonly number[] }>> {
    const metadata = await this.initialize(); const tensor = new ort.Tensor("float32", await createOwenElliottXsInput(bytes), [1, 3, 224, 224]);
    let outputTensor: ort.Tensor | undefined;
    try {
      const result = await this.session!.run({ [metadata.inputName]: tensor }); outputTensor = result[metadata.outputName] as ort.Tensor | undefined; const output = outputTensor?.data;
      const scores = Array.from(output as Float32Array);
      if (scores.length !== 3 || scores.some((score) => !Number.isFinite(score))) throw new Error("OwenElliott XS output is invalid");
      let index = 0; for (let i = 1; i < scores.length; i += 1) if (scores[i] > scores[index]) index = i;
      const nativeClass = OWEN_ELLIOTT_XS_ARTIFACT.nativeClassOrder[index]; return { nativeClass, decision: owenElliottDecisionForNativeClass(nativeClass), scores };
    } finally { try { outputTensor?.dispose(); } catch { /* Best-effort native tensor cleanup. */ } try { tensor.dispose(); } catch { /* Best-effort native tensor cleanup. */ } }
  }
}
