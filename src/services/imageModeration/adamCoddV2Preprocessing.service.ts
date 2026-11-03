import { createHash } from "node:crypto";
import sharp from "sharp";

import { ADAMCODD_IMAGE_SAFETY_LIMITS } from "./adamCoddImageSafety.config";

export type AdamCoddV2Input = Readonly<{ data: Float32Array; shape: readonly [1, 3, 384, 384]; digest: string; min: number; max: number; mean: number }>;

const floatBytes = (value: Float32Array) => Buffer.from(value.buffer, value.byteOffset, value.byteLength);

/** Exact frozen V2 preprocessing: RGB decode, direct 384-square linear resize, float32 normalization, NCHW. */
export const preprocessAdamCoddV2 = async (bytes: Buffer): Promise<AdamCoddV2Input> => {
  const decoded = await sharp(bytes, { failOn: "error" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (!decoded.info.width || !decoded.info.height || ![3, 4].includes(decoded.info.channels)) throw new Error("AdamCodd V2 preprocessing could not decode RGB/RGBA pixels");
  const sourceRgb = Buffer.alloc(decoded.info.width * decoded.info.height * 3);
  for (let pixel = 0; pixel < decoded.info.width * decoded.info.height; pixel += 1) for (let channel = 0; channel < 3; channel += 1) sourceRgb[pixel * 3 + channel] = decoded.data[pixel * decoded.info.channels + channel];
  const rgb = await sharp(sourceRgb, { raw: { width: decoded.info.width, height: decoded.info.height, channels: 3 } }).resize(384, 384, { fit: "fill", kernel: sharp.kernel.linear }).raw().toBuffer();
  if (rgb.length !== 384 * 384 * 3) throw new Error("AdamCodd V2 preprocessing produced an invalid RGB buffer");
  const plane = 384 * 384; const data = new Float32Array(plane * 3);
  let min = Number.POSITIVE_INFINITY; let max = Number.NEGATIVE_INFINITY; let sum = 0;
  for (let pixel = 0; pixel < plane; pixel += 1) for (let channel = 0; channel < 3; channel += 1) {
    const scaled = Math.fround(rgb[pixel * 3 + channel] / 255);
    const value = Math.fround(Math.fround(scaled - Math.fround(0.5)) / Math.fround(0.5));
    data[channel * plane + pixel] = value; min = Math.min(min, value); max = Math.max(max, value); sum += value;
  }
  return { data, shape: [1, 3, 384, 384], digest: createHash("sha256").update(floatBytes(data)).digest("hex"), min, max, mean: sum / data.length };
};

/**
 * V2's frozen evaluation contract consumes original verified bytes: it does not
 * use the lossy, orientation-corrected moderation derivative.  It deliberately
 * preserves EXIF orientation because the pinned ViTImageProcessor does not call
 * Pillow's exif_transpose before direct BILINEAR 384x384 resizing.
 */
export class AdamCoddV2PreprocessingError extends Error {}

const assertSafeOriginalImage = async (bytes: Buffer): Promise<void> => {
  if (!bytes.length || bytes.length > ADAMCODD_IMAGE_SAFETY_LIMITS.maxBytes) throw new AdamCoddV2PreprocessingError("Image byte limit exceeded");
  try {
    const metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels,
      pages: 1,
      animated: false,
    }).metadata();
    if (!metadata.width || !metadata.height
      || metadata.width > ADAMCODD_IMAGE_SAFETY_LIMITS.maxWidth
      || metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxHeight
      || metadata.width * metadata.height > ADAMCODD_IMAGE_SAFETY_LIMITS.maxPixels
      || (metadata.pages && metadata.pages !== 1)) throw new AdamCoddV2PreprocessingError("Image decode limits exceeded");
  } catch (error) {
    if (error instanceof AdamCoddV2PreprocessingError) throw error;
    throw new AdamCoddV2PreprocessingError("Image is invalid or unsupported");
  }
};

export class AdamCoddV2PreprocessingService {
  async preprocessOriginal(bytes: Buffer): Promise<AdamCoddV2Input> {
    await assertSafeOriginalImage(bytes);
    try {
      return await preprocessAdamCoddV2(bytes);
    } catch (error) {
      if (error instanceof AdamCoddV2PreprocessingError) throw error;
      throw new AdamCoddV2PreprocessingError("Image is invalid or unsupported");
    }
  }
}

export const adamCoddV2PreprocessingService = new AdamCoddV2PreprocessingService();
