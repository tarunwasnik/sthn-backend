import { createHash } from "node:crypto";
import sharp from "sharp";

export const ADAMCODD_RUNTIME_AUTHORITY = Object.freeze({
  repositoryId: "AdamCodd/vit-base-nsfw-detector",
  publisher: "AdamCodd",
  revision: "8587de998f441aac03fdd57a85d2e4cb808c7d64",
  artifactPath: "onnx/model_int8.onnx",
  artifactBytes: 88_500_985,
  artifactSha256: "d25aa73fe1eec78459e35ff911e2af98f652ee919b48d9c54316c86d5ff435fa",
  inputName: "pixel_values",
  outputName: "logits",
  classIndexToNativeLabel: ["sfw", "nsfw"] as const,
  inputShape: [1, 3, 384, 384] as const,
  outputShape: [1, 2] as const,
});

export type AdamCoddNativeClass = (typeof ADAMCODD_RUNTIME_AUTHORITY.classIndexToNativeLabel)[number];
export type AdamCoddNativeEvidence = Readonly<{ nativeClassIndex: number; nativeClass: AdamCoddNativeClass; logits: readonly number[]; probabilities: readonly number[] }>;
export type AdamCoddInput = Readonly<{ data: Float32Array; shape: readonly [1, 3, 384, 384]; digest: string; min: number; max: number; mean: number }>;

const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const floatBytes = (value: Float32Array) => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const finite = (value: readonly number[]) => value.every(Number.isFinite);

/**
 * Frozen Node implementation of the processor configuration: RGB decode, alpha
 * removal, direct 384x384 Pillow-BILINEAR analogue, 1/255, then (x-.5)/.5, NCHW.
 * EXIF orientation is deliberately preserved: ViTFeatureExtractor receives a
 * PIL image directly and does not itself call exif_transpose.
 */
export const preprocessAdamCodd = async (bytes: Buffer): Promise<AdamCoddInput> => {
  const decoded = await sharp(bytes, { failOn: "error" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (!decoded.info.width || !decoded.info.height || ![3, 4].includes(decoded.info.channels)) throw new Error("AdamCodd preprocessing could not decode RGB/RGBA pixels");
  const sourceRgb = Buffer.alloc(decoded.info.width * decoded.info.height * 3);
  for (let pixel = 0; pixel < decoded.info.width * decoded.info.height; pixel += 1) for (let channel = 0; channel < 3; channel += 1) sourceRgb[pixel * 3 + channel] = decoded.data[pixel * decoded.info.channels + channel];
  const rgb = await sharp(sourceRgb, { raw: { width: decoded.info.width, height: decoded.info.height, channels: 3 } })
    .resize(384, 384, { fit: "fill", kernel: sharp.kernel.linear })
    .raw()
    .toBuffer();
  if (rgb.length !== 384 * 384 * 3) throw new Error("AdamCodd preprocessing produced an invalid RGB buffer");
  const plane = 384 * 384;
  const data = new Float32Array(plane * 3);
  let min = Number.POSITIVE_INFINITY; let max = Number.NEGATIVE_INFINITY; let sum = 0;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      // NumPy's float32 rescale and normalize stages round independently.
      // Preserve those stages rather than letting JavaScript retain float64
      // intermediates until the final typed-array assignment.
      const scaled = Math.fround(rgb[pixel * 3 + channel] / 255);
      const value = Math.fround(Math.fround(scaled - Math.fround(0.5)) / Math.fround(0.5));
      data[channel * plane + pixel] = value; min = Math.min(min, value); max = Math.max(max, value); sum += value;
    }
  }
  return { data, shape: [1, 3, 384, 384], digest: hash(floatBytes(data)), min, max, mean: sum / data.length };
};

export const softmaxAdamCoddLogits = (logits: readonly number[]): readonly number[] => {
  if (logits.length !== 2 || !finite(logits)) throw new Error("AdamCodd logits must be two finite values");
  const largest = Math.max(...logits); const exps = logits.map(value => Math.exp(value - largest)); const denominator = exps[0] + exps[1];
  if (!Number.isFinite(denominator) || denominator <= 0) throw new Error("AdamCodd softmax denominator is invalid");
  const probabilities = exps.map(value => value / denominator);
  if (!finite(probabilities)) throw new Error("AdamCodd probabilities are non-finite");
  return probabilities;
};

export const interpretAdamCoddLogits = (logits: readonly number[]): AdamCoddNativeEvidence => {
  const probabilities = softmaxAdamCoddLogits(logits); let nativeClassIndex = 0;
  for (let index = 1; index < logits.length; index += 1) if (logits[index] > logits[nativeClassIndex]) nativeClassIndex = index;
  const nativeClass = ADAMCODD_RUNTIME_AUTHORITY.classIndexToNativeLabel[nativeClassIndex];
  if (!nativeClass) throw new Error("AdamCodd native class index is invalid");
  return { nativeClassIndex, nativeClass, logits: [...logits], probabilities };
};

export const validateAdamCoddTensorContract = (input: Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>, output: Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>) => {
  const inputOk = input.name === ADAMCODD_RUNTIME_AUTHORITY.inputName && input.type === "float32" && input.shape.join(",") === "batch_size,num_channels,height,width";
  const outputOk = output.name === ADAMCODD_RUNTIME_AUTHORITY.outputName && output.type === "float32" && output.shape.join(",") === "batch_size,2";
  if (!inputOk || !outputOk) throw new Error("AdamCodd ONNX tensor contract is not authoritative");
};

export const adamCoddFloatTensorSha256 = (value: Float32Array) => hash(floatBytes(value));
