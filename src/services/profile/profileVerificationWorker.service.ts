import { ulid } from "ulid";

import { processNextProfileVerificationJob } from "./profileVerificationJob.service";

const DEFAULT_IDLE_POLL_MS = 5_000;

type NextJobProcessor = typeof processNextProfileVerificationJob;
type Delay = (milliseconds: number) => Promise<void>;

export const createProfileVerificationWorker = (dependencies: {
  readonly processNext?: NextJobProcessor;
  readonly workerId?: string;
  readonly idlePollMs?: number;
  readonly wait?: Delay;
  readonly reportError?: (error: unknown) => void;
} = {}) => {
  const processNext = dependencies.processNext ?? processNextProfileVerificationJob;
  const workerId = dependencies.workerId ?? `profile-verification-${process.pid}-${ulid()}`;
  const idlePollMs = dependencies.idlePollMs ?? DEFAULT_IDLE_POLL_MS;
  let idleTimer: NodeJS.Timeout | null = null;
  let resolveIdleWait: (() => void) | null = null;
  const wait: Delay = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => {
    resolveIdleWait = () => { resolveIdleWait = null; resolve(); };
    idleTimer = setTimeout(() => { idleTimer = null; resolveIdleWait?.(); }, milliseconds);
  }));
  const reportError = dependencies.reportError ?? ((error: unknown) => console.error("Profile verification worker iteration failed", error));
  let stopping = false;
  let loop: Promise<void> | null = null;

  const run = async () => {
    while (!stopping) {
      let outcome: Awaited<ReturnType<NextJobProcessor>> | null = null;
      try { outcome = await processNext({ workerId }); }
      catch (error) { reportError(error); }
      if (!outcome && !stopping) await wait(idlePollMs);
    }
  };

  return {
    workerId,
    start: () => {
      if (loop) return loop;
      stopping = false;
      loop = run().finally(() => { loop = null; });
      return loop;
    },
    stop: async () => {
      stopping = true;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      resolveIdleWait?.();
      await loop;
    },
    isRunning: () => loop !== null,
  };
};

let runtimeWorker: ReturnType<typeof createProfileVerificationWorker> | null = null;

/** Starts one sequential in-process poller; durable Mongo claims remain cross-process authority. */
export const startProfileVerificationWorker = () => {
  if (!runtimeWorker) runtimeWorker = createProfileVerificationWorker();
  void runtimeWorker.start();
  return runtimeWorker;
};

export const stopProfileVerificationWorker = async () => {
  const worker = runtimeWorker;
  runtimeWorker = null;
  await worker?.stop();
};
