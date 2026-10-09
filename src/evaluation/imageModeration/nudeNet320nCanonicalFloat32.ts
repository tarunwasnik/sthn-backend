import { createHash } from "node:crypto";

export const NUDE_NET_CANONICAL_FLOAT32_SCALE = Math.fround(1 / 255);
export const float32Bits = (value: number): string => { const bytes = new ArrayBuffer(4); new DataView(bytes).setFloat32(0, value, true); return new DataView(bytes).getUint32(0, true).toString(16).padStart(8, "0"); };

/** Matches OpenCV Blob Float32 scaling: Float32(pixel) multiplied by Float32(1/255). */
export const canonicalFloat32RgbNchw = (rgb: Uint8Array): Float32Array => {
  if (rgb.length !== 320 * 320 * 3) throw new Error("Canonical NudeNet normalization requires 320x320 RGB");
  const plane = 320 * 320; const data = new Float32Array(rgb.length);
  for (let pixel = 0; pixel < plane; pixel += 1) { data[pixel] = Math.fround(Math.fround(rgb[pixel * 3]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); data[plane + pixel] = Math.fround(Math.fround(rgb[pixel * 3 + 1]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); data[plane * 2 + pixel] = Math.fround(Math.fround(rgb[pixel * 3 + 2]) * NUDE_NET_CANONICAL_FLOAT32_SCALE); }
  return data;
};
export const float32Digest = (data: Float32Array): string => createHash("sha256").update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest("hex");
