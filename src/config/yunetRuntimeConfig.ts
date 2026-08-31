import path from "node:path";

/** Immutable process-lifetime YuNet configuration captured after dotenv bootstrap. */
const configuredPath = process.env.STHN_YUNET_MODEL_PATH;
const normalizedPath = typeof configuredPath === "string" ? configuredPath.trim() : "";

export const YUNET_RUNTIME_CONFIG = Object.freeze({
  configuredPath: normalizedPath || undefined,
  resolvedPath: normalizedPath ? path.resolve(process.cwd(), normalizedPath) : undefined,
});
