import path from "node:path";

const isExperimentalImageModerationPath = (value: string) => {
  const segments = value.replace(/\\/g, "/").toLowerCase().split("/");
  return segments.includes("evaluation-cache") || segments.includes("evaluation-output");
};

export class AdamCoddRuntimeConfigurationError extends Error {}

/**
 * V1 selection and artifact settings are retired.  Rejecting non-empty values
 * makes an incomplete deployment fail closed rather than silently changing its
 * selected moderation model.
 */
export const assertNoRetiredAdamCoddConfiguration = (environment: NodeJS.ProcessEnv = process.env): void => {
  for (const name of ["STHN_IMAGE_AI_ADAM_PIPELINE", "STHN_IMAGE_AI_ADAM_MODEL_PATH"] as const) {
    if (environment[name]?.trim()) throw new AdamCoddRuntimeConfigurationError(`${name} is retired; configure only STHN_IMAGE_AI_ADAM_V2_MODEL_PATH.`);
  }
};

/**
 * V2 has no default artifact path and never consumes experimental artifacts.
 * Its artifact must be separately packaged for a controlled runtime.
 */
export const resolveAdamCoddV2ModelPath = (configured = process.env.STHN_IMAGE_AI_ADAM_V2_MODEL_PATH): string | null => {
  const value = typeof configured === "string" ? configured.trim() : "";
  if (!value) return null;
  const resolved = path.resolve(process.cwd(), value);
  return isExperimentalImageModerationPath(resolved) ? null : resolved;
};

export const ADAMCODD_IMAGE_SAFETY_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  /**
   * Admission keeps the original browser bytes authoritative.  This ceiling is
   * deliberately finite, while allowing ordinary modern-phone photographs.
   * Expensive decode/derivative work is separately limited to one active job.
   */
  maxWidth: 10_000,
  maxHeight: 10_000,
  maxPixels: 64_000_000,
  processingDerivativeMaxLongEdge: 2560,
  maxConcurrentProcessing: 1,
  maxQueuedProcessing: 2,
  maxConcurrentInferences: 2,
  maxQueuedInferences: 8,
});
