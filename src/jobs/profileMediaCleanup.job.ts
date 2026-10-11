import { profileMediaCleanupWorkerService } from "../services/profile/profileMediaCleanupWorker.service";

/** Kept separate from profile persistence; the scheduler controls whether it ever executes. */
export const profileMediaCleanupJob = async (input: { limit?: number } = {}) => profileMediaCleanupWorkerService.processBatch(input);
