/**
 * Frozen local V2 candidate authority. This does not activate the model or
 * authorize production use; runtime selection remains opt-in and server-only.
 */
export const ADAMCODD_V2_RUNTIME_AUTHORITY = Object.freeze({
  modelIdentifier: "STHN_ADAMCODD_V2_INT8",
  revision: "owner-local-883-v1-avif",
  artifactFileName: "adamcodd-v2-int8.onnx",
  artifactBytes: 89_972_519,
  artifactSha256: "ce69ce3cfbcb62655c386fc3223fe7e38c23bdf1f58eb356767566a72d275da0",
  inputName: "pixel_values",
  inputShape: [1, 3, 384, 384] as const,
  inputType: "float32",
  outputName: "logits",
  outputShape: [1, 2] as const,
  outputType: "float32",
  classIndexToNativeLabel: ["sfw", "nsfw"] as const,
  nsfwBlockThreshold: 0.3362914399272772,
  preprocessingId: "STHN_ADAMCODD_V2_ORIGINAL_SHARP_LINEAR_V1",
  decisionRuleId: "STHN_ADAMCODD_V2_NSFW_SOFTMAX_GTE_THRESHOLD_V1",
});

export type AdamCoddV2NativeClass = (typeof ADAMCODD_V2_RUNTIME_AUTHORITY.classIndexToNativeLabel)[number];

export const validateAdamCoddV2TensorContract = (input: Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>, output: Readonly<{ name: string; type: string; shape: readonly (string | number)[] }>): void => {
  const inputOk = input.name === ADAMCODD_V2_RUNTIME_AUTHORITY.inputName
    && input.type === ADAMCODD_V2_RUNTIME_AUTHORITY.inputType
    && input.shape.join(",") === "batch_size,3,384,384";
  const outputOk = output.name === ADAMCODD_V2_RUNTIME_AUTHORITY.outputName
    && output.type === ADAMCODD_V2_RUNTIME_AUTHORITY.outputType
    && output.shape.join(",") === "batch_size,2";
  if (!inputOk || !outputOk) throw new Error("AdamCodd V2 ONNX tensor contract is not authoritative");
};
