import path from "node:path";

const isEvaluationCachePath = (value: string) => value.replace(/\\/g, "/").toLowerCase().split("/").includes("evaluation-cache");

/**
 * Production deliberately has no default artifact path. Deployment must package the
 * pinned ONNX file separately (for example, backend/models/adamcodd/model_int8.onnx)
 * and set this path. Evaluation cache is never a production fallback.
 */
export const resolveAdamCoddModelPath = (configured = process.env.STHN_IMAGE_AI_ADAM_MODEL_PATH): string | null => {
  const value = typeof configured === "string" ? configured.trim() : "";
  if (!value) return null;
  const resolved = path.resolve(process.cwd(), value);
  return isEvaluationCachePath(resolved) ? null : resolved;
};

export const ADAMCODD_IMAGE_SAFETY_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 16_777_216,
  maxConcurrentInferences: 2,
  maxQueuedInferences: 8,
});
