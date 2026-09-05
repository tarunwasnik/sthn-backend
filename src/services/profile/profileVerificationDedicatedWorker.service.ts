import mongoose from "mongoose";

import { PROFILE_VERIFICATION_WORKER_ENABLED } from "../../config/profileVerificationWorkerExecution";
import { reportProfileVerificationMemory } from "./profileVerificationMemoryDiagnostic.service";
import { startProfileVerificationWorker, stopProfileVerificationWorker } from "./profileVerificationWorker.service";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface DedicatedProfileVerificationWorkerDependencies {
  workerEnabled?: boolean;
  mongoUri?: string;
  connectMongo?: (uri: string) => Promise<unknown>;
  disconnectMongo?: () => Promise<unknown>;
  startWorker?: typeof startProfileVerificationWorker;
  stopWorker?: typeof stopProfileVerificationWorker;
  registerSignal?: (signal: ShutdownSignal, listener: () => void) => void;
  reportLifecycle?: (stage: "PROCESS_SIGINT" | "PROCESS_SIGTERM") => void;
  log?: (message: string) => void;
}

/**
 * Starts only the sequential profile-verification poller against MongoDB.
 * Exactly one runtime may enable this capability for a shared authoritative queue.
 */
export const startDedicatedProfileVerificationWorker = async (
  dependencies: DedicatedProfileVerificationWorkerDependencies = {},
) => {
  const enabled = dependencies.workerEnabled ?? PROFILE_VERIFICATION_WORKER_ENABLED;
  if (!enabled) throw new Error("Dedicated profile-verification worker requires STHN_PROFILE_VERIFICATION_WORKER_ENABLED=true");
  const mongoUri = dependencies.mongoUri ?? process.env.MONGODB_URI;
  if (!mongoUri?.trim()) throw new Error("Dedicated profile-verification worker requires MONGODB_URI");
  const connectMongo = dependencies.connectMongo ?? ((uri: string) => mongoose.connect(uri));
  const disconnectMongo = dependencies.disconnectMongo ?? (() => mongoose.disconnect());
  const startWorker = dependencies.startWorker ?? startProfileVerificationWorker;
  const stopWorker = dependencies.stopWorker ?? stopProfileVerificationWorker;
  const registerSignal = dependencies.registerSignal ?? ((signal, listener) => process.once(signal, listener));
  const reportLifecycle = dependencies.reportLifecycle ?? reportProfileVerificationMemory;
  const log = dependencies.log ?? console.log;

  mongoose.set("bufferCommands", false);
  await connectMongo(mongoUri.trim());
  startWorker();
  log("Dedicated profile-verification worker started with concurrency 1. Keep every other worker authority disabled for this queue.");

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: ShutdownSignal) => {
    if (!shutdownPromise) {
      reportLifecycle(signal === "SIGINT" ? "PROCESS_SIGINT" : "PROCESS_SIGTERM");
      shutdownPromise = (async () => {
      await stopWorker();
      await disconnectMongo();
      log("Dedicated profile-verification worker stopped.");
      })();
    }
    return shutdownPromise;
  };
  registerSignal("SIGINT", () => void shutdown("SIGINT"));
  registerSignal("SIGTERM", () => void shutdown("SIGTERM"));
  return { shutdown };
};
