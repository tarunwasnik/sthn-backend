import { MEDIA_CLEANUP_WORKER_EXECUTION, MediaCleanupWorkerExecutionConfig } from "../config/mediaCleanupWorkerExecution";
import { profileMediaCleanupJob } from "../jobs/profileMediaCleanup.job";
import { temporaryImageAssetCleanupJob } from "../jobs/temporaryImageAssetCleanup.job";

type Timer = NodeJS.Timeout;
type TemporaryBatch = Awaited<ReturnType<typeof temporaryImageAssetCleanupJob>>;
type ProfileBatch = Awaited<ReturnType<typeof profileMediaCleanupJob>>;
type Report = (event: string, details: Record<string, unknown>) => void;

const reportConsole: Report = (event, details) => console.info(JSON.stringify({ component: "media-cleanup-scheduler", event, ...details }));
const summarizeTemporary = (batch: TemporaryBatch) => batch.results.reduce<Record<string, number>>((summary, result) => ({ ...summary, [result.kind]: (summary[result.kind] ?? 0) + 1 }), {});
const summarizeProfile = (batch: ProfileBatch) => batch.reduce<Record<string, number>>((summary, result) => result ? ({ ...summary, [result.kind]: (summary[result.kind] ?? 0) + 1 }) : summary, {});

export interface MediaCleanupSchedulerDependencies {
  readonly config?: MediaCleanupWorkerExecutionConfig;
  readonly temporaryJob?: typeof temporaryImageAssetCleanupJob;
  readonly profileJob?: typeof profileMediaCleanupJob;
  readonly report?: Report;
  readonly setInterval?: (callback: () => void, milliseconds: number) => Timer;
  readonly clearInterval?: (timer: Timer) => void;
  readonly now?: () => number;
}

/**
 * A bounded, opt-in in-process scheduler. It intentionally performs no boot
 * sweep: enabled work begins only after the interval elapses. Mongo claims and
 * provider-guard reservations are the cross-process authority.
 */
export const createMediaCleanupScheduler = (dependencies: MediaCleanupSchedulerDependencies = {}) => {
  const config = dependencies.config ?? MEDIA_CLEANUP_WORKER_EXECUTION;
  const temporaryJob = dependencies.temporaryJob ?? temporaryImageAssetCleanupJob;
  const profileJob = dependencies.profileJob ?? profileMediaCleanupJob;
  const report = dependencies.report ?? reportConsole;
  const schedule: (callback: () => void, milliseconds: number) => Timer = dependencies.setInterval ?? ((callback, milliseconds) => setInterval(callback, milliseconds) as unknown as Timer);
  const cancel: (timer: Timer) => void = dependencies.clearInterval ?? ((timer) => clearInterval(timer));
  const now = dependencies.now ?? Date.now;
  let temporaryTimer: Timer | null = null;
  let profileTimer: Timer | null = null;
  let temporaryRun: Promise<void> | null = null;
  let profileRun: Promise<void> | null = null;

  const invoke = async (kind: "temporary" | "profile"): Promise<boolean> => {
    const enabled = kind === "temporary" ? config.temporaryEnabled : config.profileMediaEnabled;
    if (!enabled) return false;
    const active = kind === "temporary" ? temporaryRun : profileRun;
    if (active) { report("overlap_skipped", { worker: kind }); return false; }
    const started = now();
    const work = (async () => {
      try {
        report("invocation_started", { worker: kind });
        const batch = kind === "temporary"
          ? await temporaryJob({ limit: config.temporaryBatchSize })
          : await profileJob({ limit: config.profileMediaBatchSize });
        report("invocation_completed", { worker: kind, durationMs: now() - started, outcomes: kind === "temporary" ? summarizeTemporary(batch as TemporaryBatch) : summarizeProfile(batch as ProfileBatch) });
      } catch (error) {
        report("invocation_failed", { worker: kind, durationMs: now() - started, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown worker error" });
      } finally {
        if (kind === "temporary") temporaryRun = null;
        else profileRun = null;
      }
    })();
    if (kind === "temporary") temporaryRun = work;
    else profileRun = work;
    await work;
    return true;
  };

  return {
    start: () => {
      if (config.temporaryEnabled && !temporaryTimer) temporaryTimer = schedule(() => { void invoke("temporary"); }, config.temporaryIntervalMs);
      if (config.profileMediaEnabled && !profileTimer) profileTimer = schedule(() => { void invoke("profile"); }, config.profileMediaIntervalMs);
      report("scheduler_started", { temporaryEnabled: config.temporaryEnabled, profileMediaEnabled: config.profileMediaEnabled, temporaryIntervalMs: config.temporaryIntervalMs, profileMediaIntervalMs: config.profileMediaIntervalMs, temporaryBatchSize: config.temporaryBatchSize, profileMediaBatchSize: config.profileMediaBatchSize });
      return { temporaryEnabled: config.temporaryEnabled, profileMediaEnabled: config.profileMediaEnabled };
    },
    stop: async () => {
      if (temporaryTimer) { cancel(temporaryTimer); temporaryTimer = null; }
      if (profileTimer) { cancel(profileTimer); profileTimer = null; }
      await Promise.all([temporaryRun, profileRun]);
      report("scheduler_stopped", {});
    },
    runTemporaryNow: () => invoke("temporary"),
    runProfileNow: () => invoke("profile"),
    isRunning: () => Boolean(temporaryTimer || profileTimer),
  };
};

let runtimeScheduler: ReturnType<typeof createMediaCleanupScheduler> | null = null;
export const startMediaCleanupSchedulerIfEnabled = () => {
  if (!MEDIA_CLEANUP_WORKER_EXECUTION.temporaryEnabled && !MEDIA_CLEANUP_WORKER_EXECUTION.profileMediaEnabled) return false;
  if (!runtimeScheduler) runtimeScheduler = createMediaCleanupScheduler();
  runtimeScheduler.start();
  return true;
};
export const stopMediaCleanupScheduler = async () => { const scheduler = runtimeScheduler; runtimeScheduler = null; await scheduler?.stop(); };
