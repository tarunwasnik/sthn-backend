const parseBoolean = (name: string, value: string | undefined): boolean => {
  if (value === undefined) return false;
  if (value.trim() === "true") return true;
  if (value.trim() === "false") return false;
  throw new Error(`${name} must be exactly true or false`);
};

const parseBoundedInteger = (name: string, value: string | undefined, fallback: number, minimum: number, maximum: number) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
};

export interface MediaCleanupWorkerExecutionConfig {
  readonly temporaryEnabled: boolean;
  readonly profileMediaEnabled: boolean;
  readonly temporaryIntervalMs: number;
  readonly profileMediaIntervalMs: number;
  readonly temporaryBatchSize: number;
  readonly profileMediaBatchSize: number;
}

/** Missing flags are deliberately disabled; malformed explicit settings abort startup. */
export const readMediaCleanupWorkerExecutionConfig = (environment: NodeJS.ProcessEnv = process.env): MediaCleanupWorkerExecutionConfig => ({
  temporaryEnabled: parseBoolean("STHN_TEMPORARY_IMAGE_CLEANUP_ENABLED", environment.STHN_TEMPORARY_IMAGE_CLEANUP_ENABLED),
  profileMediaEnabled: parseBoolean("STHN_PROFILE_MEDIA_CLEANUP_ENABLED", environment.STHN_PROFILE_MEDIA_CLEANUP_ENABLED),
  temporaryIntervalMs: parseBoundedInteger("STHN_TEMPORARY_IMAGE_CLEANUP_INTERVAL_MS", environment.STHN_TEMPORARY_IMAGE_CLEANUP_INTERVAL_MS, 300_000, 10_000, 3_600_000),
  profileMediaIntervalMs: parseBoundedInteger("STHN_PROFILE_MEDIA_CLEANUP_INTERVAL_MS", environment.STHN_PROFILE_MEDIA_CLEANUP_INTERVAL_MS, 300_000, 10_000, 3_600_000),
  temporaryBatchSize: parseBoundedInteger("STHN_TEMPORARY_IMAGE_CLEANUP_BATCH_SIZE", environment.STHN_TEMPORARY_IMAGE_CLEANUP_BATCH_SIZE, 20, 1, 100),
  profileMediaBatchSize: parseBoundedInteger("STHN_PROFILE_MEDIA_CLEANUP_BATCH_SIZE", environment.STHN_PROFILE_MEDIA_CLEANUP_BATCH_SIZE, 20, 1, 100),
});

export const MEDIA_CLEANUP_WORKER_EXECUTION = readMediaCleanupWorkerExecutionConfig();
