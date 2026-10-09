import { createHash } from "node:crypto";

export const G8C_R6_CANDIDATE_IDS = [
  "candidate-06e0fcca6c4fdfc9",
  "candidate-01ef942c2c69fa88",
  "candidate-03e83650ace99466",
  "candidate-05453abafb9dc346",
] as const;

export const G8C_R6_OUTPUT_BYTES = 320 * 320 * 3;
export const G8C_R6_PACKAGE = "@techstark/opencv-js";
export const G8C_R6_PACKAGE_VERSION = "5.0.0-release.1";
export const G8C_R6_OPENCV_SHA256 = "b873c8211421da7b9bf41ae157a923f05a46a0b8d3e5904c44c6f3ad6d39a1bd";

export const sha256 = (value: Buffer | Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

export const assertR6RgbSquare = (data: Uint8Array, width: number, height: number, channels: number): void => {
  if (!Number.isInteger(width) || width <= 0 || width !== height || channels !== 3 || data.length !== width * height * channels) {
    throw new Error("R6 requires a valid square RGB Uint8 buffer");
  }
};

export const compareR6Bytes = (canonical: Uint8Array, wasm: Uint8Array) => {
  if (canonical.length !== G8C_R6_OUTPUT_BYTES || wasm.length !== G8C_R6_OUTPUT_BYTES) {
    throw new Error("R6 resize output must be exactly 320x320x3");
  }
  let differingBytes = 0;
  let sum = 0;
  let maxAbsoluteDifference = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    const difference = Math.abs(canonical[index] - wasm[index]);
    if (difference !== 0) differingBytes += 1;
    sum += difference;
    maxAbsoluteDifference = Math.max(maxAbsoluteDifference, difference);
  }
  return {
    canonicalSha256: sha256(canonical),
    wasmSha256: sha256(wasm),
    exactEquality: differingBytes === 0,
    differingBytes,
    differingFraction: differingBytes / canonical.length,
    meanAbsoluteDifference: sum / canonical.length,
    maxAbsoluteDifference,
  };
};
