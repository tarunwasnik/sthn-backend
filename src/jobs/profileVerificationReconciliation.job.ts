import { reconcileProfileVerificationJobs } from "../services/profile/profileVerificationJob.service";

export const profileVerificationReconciliationJob = async () => reconcileProfileVerificationJobs();
