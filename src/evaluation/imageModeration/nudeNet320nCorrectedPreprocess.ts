import { createHash } from "node:crypto";
import sharp from "sharp";

export const NUDE_NET_INPUT_SIDE = 320;
export const NUDE_NET_INPUT_CHANNELS = 3;
export const NUDE_NET_INPUT_ELEMENT_COUNT =
  NUDE_NET_INPUT_SIDE * NUDE_NET_INPUT_SIDE * NUDE_NET_INPUT_CHANNELS;

export type RawPixels = Readonly<{
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}>;

export type VerifiedRawMetadata = Readonly<{
  width: number;
  height: number;
  channels: number;
  length: number;
  expectedLength: number;
}>;

const expectedLength = (raw: Pick<RawPixels, "width" | "height" | "channels">): number =>
  raw.width * raw.height * raw.channels;

const verifyRgbRaw = (raw: RawPixels, stage: string): void => {
  if (
    !Number.isInteger(raw.width) ||
    !Number.isInteger(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0 ||
    raw.channels !== NUDE_NET_INPUT_CHANNELS ||
    raw.data.length !== expectedLength(raw)
  ) {
    throw new Error(`${stage} must be a valid three-channel RGB raw buffer`);
  }
};

const metadata = (raw: RawPixels): VerifiedRawMetadata => ({
  width: raw.width,
  height: raw.height,
  channels: raw.channels,
  length: raw.data.length,
  expectedLength: expectedLength(raw),
});

/** Decodes without EXIF auto-rotation and fails closed unless Sharp yields RGB raw pixels. */
export const decodeToVerifiedRgb = async (bytes: Buffer): Promise<RawPixels> => {
  const decoded = await sharp(bytes, { failOn: "error" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: RawPixels = {
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
  };
  verifyRgbRaw(raw, "Decoded source");
  return raw;
};

/** Materializes canonical right/bottom zero padding. Source pixels begin at (0, 0). */
export const squareVerifiedRgb = (source: RawPixels): RawPixels => {
  verifyRgbRaw(source, "Source for square padding");
  const side = Math.max(source.width, source.height);
  const data = Buffer.alloc(side * side * NUDE_NET_INPUT_CHANNELS);
  const sourceRowLength = source.width * NUDE_NET_INPUT_CHANNELS;
  const squareRowLength = side * NUDE_NET_INPUT_CHANNELS;
  for (let y = 0; y < source.height; y += 1) {
    source.data.copy(data, y * squareRowLength, y * sourceRowLength, (y + 1) * sourceRowLength);
  }
  const square: RawPixels = { data, width: side, height: side, channels: NUDE_NET_INPUT_CHANNELS };
  verifyRgbRaw(square, "Materialized square padding");
  return square;
};

/** Resizes only an already materialized square RGB image to the fixed model geometry. */
export const resizeVerifiedSquareRgb = async (square: RawPixels): Promise<RawPixels> => {
  verifyRgbRaw(square, "Square resize input");
  if (square.width !== square.height) throw new Error("Square resize input must have equal width and height");
  const resized = await sharp(square.data, {
    raw: { width: square.width, height: square.height, channels: NUDE_NET_INPUT_CHANNELS },
  })
    .resize(NUDE_NET_INPUT_SIDE, NUDE_NET_INPUT_SIDE, { fit: "fill", kernel: sharp.kernel.linear })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: RawPixels = {
    data: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    channels: resized.info.channels,
  };
  verifyRgbRaw(raw, "Resized square");
  if (raw.width !== NUDE_NET_INPUT_SIDE || raw.height !== NUDE_NET_INPUT_SIDE) {
    throw new Error("Resized square must be exactly 320 by 320");
  }
  return raw;
};

export const tensorFromVerifiedRgb = (raw: RawPixels) => {
  verifyRgbRaw(raw, "Tensor input");
  if (raw.width !== NUDE_NET_INPUT_SIDE || raw.height !== NUDE_NET_INPUT_SIDE) {
    throw new Error("Tensor input must be exactly 320 by 320 RGB");
  }
  const plane = NUDE_NET_INPUT_SIDE * NUDE_NET_INPUT_SIDE;
  const data = new Float32Array(NUDE_NET_INPUT_ELEMENT_COUNT);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    data[pixel] = raw.data[pixel * 3] / 255;
    data[plane + pixel] = raw.data[pixel * 3 + 1] / 255;
    data[plane * 2 + pixel] = raw.data[pixel * 3 + 2] / 255;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let finiteCount = 0;
  for (const value of data) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid tensor value");
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    finiteCount += 1;
  }
  if (data.length !== NUDE_NET_INPUT_ELEMENT_COUNT || finiteCount !== NUDE_NET_INPUT_ELEMENT_COUNT) {
    throw new Error("Tensor must contain exactly 307200 finite elements");
  }
  return {
    data,
    shape: [1, NUDE_NET_INPUT_CHANNELS, NUDE_NET_INPUT_SIDE, NUDE_NET_INPUT_SIDE] as const,
    min,
    max,
    mean: sum / data.length,
    finiteCount,
    digest: createHash("sha256").update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest("hex"),
  };
};

export const preprocessCorrectedNudeNet = async (bytes: Buffer) => {
  const decoded = await decodeToVerifiedRgb(bytes);
  const square = squareVerifiedRgb(decoded);
  const resized = await resizeVerifiedSquareRgb(square);
  const tensor = tensorFromVerifiedRgb(resized);
  return {
    decode: metadata(decoded),
    square: {
      ...metadata(square),
      squareSide: square.width,
      rightPadding: square.width - decoded.width,
      bottomPadding: square.height - decoded.height,
    },
    resized: metadata(resized),
    tensor,
  };
};
