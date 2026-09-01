import { PROFILE_VERIFICATION_WORKER_ENABLED } from "../../config/profileVerificationWorkerExecution";
import { startProfileVerificationWorker } from "./profileVerificationWorker.service";

/** Keeps API-server startup separate from the explicit capability to claim verification jobs. */
export const startProfileVerificationWorkerIfEnabled = (dependencies: {
  readonly workerEnabled?: boolean;
  readonly startWorker?: typeof startProfileVerificationWorker;
} = {}): boolean => {
  const workerEnabled = dependencies.workerEnabled ?? PROFILE_VERIFICATION_WORKER_ENABLED;
  if (!workerEnabled) return false;
  (dependencies.startWorker ?? startProfileVerificationWorker)();
  return true;
};
