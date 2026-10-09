import { createHash } from "node:crypto";
import sharp from "sharp";
import { pillowBicubicResizeRgb } from "./pillowBicubicResampler";

export const MARQO_RUNTIME_AUTHORITY = Object.freeze({
  repositoryId: "Marqo/nsfw-image-detection-384",
  publisher: "Marqo",
  revision: "0c26ec22111b83f106d72a55f611ec35962bcb65",
  architecture: "vit_tiny_patch16_384",
  inputName: "input",
  outputName: "logits",
  classIndexToNativeLabel: ["NSFW", "SFW"] as const,
  inputShape: [1, 3, 384, 384] as const,
  outputShape: [1, 2] as const,
  interpolation: "bicubic",
  cropMode: "center",
  cropPct: 1,
  mean: [0.5, 0.5, 0.5] as const,
  std: [0.5, 0.5, 0.5] as const,
});

export type MarqoNativeClass = (typeof MARQO_RUNTIME_AUTHORITY.classIndexToNativeLabel)[number];
export type MarqoInput = Readonly<{ data: Float32Array; shape: readonly [1, 3, 384, 384]; digest: string; min: number; max: number; mean: number }>;

const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const floatBytes = (value: Float32Array) => Buffer.from(value.buffer, value.byteOffset, value.byteLength);

/** Implements the pinned timm inference transform: PIL RGB conversion, bicubic
 * resize of the short edge to 384, centered 384-square crop, then x/255 and
 * (x - 0.5) / 0.5 in NCHW. Sharp's cubic kernel is separately parity-audited. */
export const preprocessMarqo = async (bytes: Buffer): Promise<MarqoInput> => {
  const decoded = await sharp(bytes, { failOn: "error" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (!decoded.info.width || !decoded.info.height || ![3, 4].includes(decoded.info.channels)) throw new Error("Marqo preprocessing could not decode RGB/RGBA pixels");
  const rgb = Buffer.alloc(decoded.info.width * decoded.info.height * 3);
  for (let pixel = 0; pixel < decoded.info.width * decoded.info.height; pixel += 1) for (let channel = 0; channel < 3; channel += 1) rgb[pixel * 3 + channel] = decoded.data[pixel * decoded.info.channels + channel];
  const sourceWidth=decoded.info.width, sourceHeight=decoded.info.height;
  const scale=384/Math.min(sourceWidth,sourceHeight);
  const resizeWidth=Math.floor(sourceWidth*scale), resizeHeight=Math.floor(sourceHeight*scale);
  const cropLeft=Math.round((resizeWidth-384)/2), cropTop=Math.round((resizeHeight-384)/2);
  const resized=pillowBicubicResizeRgb(rgb,sourceWidth,sourceHeight,resizeWidth,resizeHeight);const pixels=Buffer.alloc(384*384*3);for(let y=0;y<384;y++)pixels.set(resized.subarray(((y+cropTop)*resizeWidth+cropLeft)*3,((y+cropTop)*resizeWidth+cropLeft+384)*3),y*384*3);
  const plane = 384 * 384; if (pixels.length !== plane * 3) throw new Error("Marqo preprocessing produced an invalid RGB buffer");
  const data = new Float32Array(plane * 3); let min = Infinity; let max = -Infinity; let sum = 0;
  for (let pixel = 0; pixel < plane; pixel += 1) for (let channel = 0; channel < 3; channel += 1) {
    const scaled = Math.fround(pixels[pixel * 3 + channel] / 255);
    const value = Math.fround(Math.fround(scaled - Math.fround(0.5)) / Math.fround(0.5));
    data[channel * plane + pixel] = value; min = Math.min(min, value); max = Math.max(max, value); sum += value;
  }
  return { data, shape: [1, 3, 384, 384], digest: sha256(floatBytes(data)), min, max, mean: sum / data.length };
};

export const interpretMarqoLogits = (logits: readonly number[]) => {
  if (logits.length !== 2 || !logits.every(Number.isFinite)) throw new Error("Marqo logits must contain two finite values");
  const nativeClassIndex = logits[1] > logits[0] ? 1 : 0;
  return { nativeClassIndex, nativeClass: MARQO_RUNTIME_AUTHORITY.classIndexToNativeLabel[nativeClassIndex], logits: [...logits] };
};

export const marqoFloatTensorSha256 = (value: Float32Array) => sha256(floatBytes(value));
