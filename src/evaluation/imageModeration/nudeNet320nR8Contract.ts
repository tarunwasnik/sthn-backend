import { createHash } from "node:crypto";

export const G8C_R8_STAGE_A_IDS = ["candidate-06e0fcca6c4fdfc9", "candidate-0bdab150c4e83d8d", "candidate-0d14fff409c320e1", "candidate-103b693ec3f39e59", "candidate-01ef942c2c69fa88", "candidate-03e83650ace99466", "candidate-05453abafb9dc346", "candidate-05d37bf912e9662c", "candidate-0177acbe18bd5673", "candidate-0314599e386f9221", "candidate-005961a7e0042fac", "candidate-01aef20b78fb8be6", "candidate-080b07bb488ecae1", "candidate-08fbb0df5b705e87", "candidate-01ec2bdc60259503", "candidate-03f102edf98563e4"] as const;
export const r8Hash = (value: Buffer | Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
export const compareR8Bytes = (canonical: Uint8Array, node: Uint8Array) => {
  if (canonical.length !== node.length) return { exact: false, lengthEqual: false, differingBytes: null, differingFraction: null, meanAbsoluteDifference: null, maxAbsoluteDifference: null, canonicalSha256: r8Hash(canonical), nodeSha256: r8Hash(node) };
  let differingBytes = 0, sum = 0, maxAbsoluteDifference = 0;
  for (let index = 0; index < canonical.length; index += 1) { const delta = Math.abs(canonical[index] - node[index]); if (delta) differingBytes += 1; sum += delta; maxAbsoluteDifference = Math.max(maxAbsoluteDifference, delta); }
  return { exact: differingBytes === 0, lengthEqual: true, differingBytes, differingFraction: differingBytes / canonical.length, meanAbsoluteDifference: sum / canonical.length, maxAbsoluteDifference, canonicalSha256: r8Hash(canonical), nodeSha256: r8Hash(node) };
};
export const canExecuteR8StageB = (stageAStatus: string): boolean => stageAStatus === "PREPROCESSING_TENSOR_PARITY_CONFIRMED";
