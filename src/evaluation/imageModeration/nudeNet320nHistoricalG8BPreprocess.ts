import { createHash } from "node:crypto";
import { decodeToVerifiedRgb, squareVerifiedRgb } from "./nudeNet320nCorrectedPreprocess";
import { NUDE_NET_CANONICAL_FLOAT32_SCALE } from "./nudeNet320nCanonicalFloat32";

export const historicalG8BTensor = (rgb: Uint8Array): Float32Array => {
  if (rgb.length !== 320 * 320 * 3) throw new Error("Historical G8-B tensor requires 320x320 three-channel bytes");
  const plane = 320 * 320; const output = new Float32Array(plane * 3);
  // G8-B's COLOR_RGBA2BGR result is passed directly to blobFromImage(swapRB=true).
  // With Node's RGB representation, that effective final plane order is B, G, R.
  for (let pixel = 0; pixel < plane; pixel += 1) { output[pixel] = Math.fround(Math.fround(rgb[pixel * 3 + 2]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); output[plane + pixel] = Math.fround(Math.fround(rgb[pixel * 3 + 1]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); output[plane * 2 + pixel] = Math.fround(Math.fround(rgb[pixel * 3]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); }
  return output;
};
export const historicalG8BTensorSha256 = (tensor: Float32Array) => createHash("sha256").update(Buffer.from(tensor.buffer, tensor.byteOffset, tensor.byteLength)).digest("hex");
export const historicalG8BResizeAndTensor = async (bytes: Buffer, cv: any) => {
  const decoded = await decodeToVerifiedRgb(bytes); const square = squareVerifiedRgb(decoded); const source = cv.matFromArray(square.height, square.width, cv.CV_8UC3, square.data); const resized = new cv.Mat();
  try { cv.resize(source, resized, new cv.Size(320, 320), 0, 0, cv.INTER_LINEAR); const rgb = Uint8Array.from(resized.data); const tensor = historicalG8BTensor(rgb); return { decoded, square, resizedRgb: rgb, tensor, tensorSha256: historicalG8BTensorSha256(tensor) }; } finally { source.delete(); resized.delete(); }
};
