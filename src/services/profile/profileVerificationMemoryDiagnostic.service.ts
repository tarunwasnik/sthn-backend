export const PROFILE_VERIFICATION_MEMORY_DIAGNOSTIC_EVENT = "PROFILE_VERIFICATION_MEMORY_DIAGNOSTIC" as const;

export const PROFILE_VERIFICATION_MEMORY_STAGES = [
  "WORKER_CLAIMED",
  "LIVE_ANALYSIS_START",
  "LIVE_ANALYSIS_COMPLETE",
  "PROFILE_MEDIA_ANALYSIS_START",
  "PROFILE_MEDIA_ITEM_COMPLETE",
  "PROFILE_MEDIA_ANALYSIS_COMPLETE",
  "GATE1_COMPLETE",
  "GATE2_COMPLETE",
  "GATE3_COMPLETE",
  "INFERENCE_FINALIZED",
  "DECISION_APPLIED",
  "WORKER_COMPLETED",
  "PROCESS_SIGTERM",
  "PROCESS_SIGINT",
  "PROCESS_BEFORE_EXIT",
  "PROCESS_EXIT",
] as const;

export type ProfileVerificationMemoryStage = typeof PROFILE_VERIFICATION_MEMORY_STAGES[number];
export type ProfileVerificationMemoryMediaRole = "AVATAR" | "COVER" | "PROFILE_PHOTO";
export type ProfileVerificationMemoryDecisionType = "APPROVED" | "REJECTED" | "ADMIN_REVIEW_REQUIRED";

type MemoryUsage = Pick<NodeJS.MemoryUsage, "rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers">;

const toBoundedMiB = (bytes: number) => Math.min(1_048_576, Math.max(0, Math.round((bytes / 1_048_576) * 10) / 10));

export const createProfileVerificationMemoryDiagnostic = (
  stage: ProfileVerificationMemoryStage,
  metadata: { mediaIndex?: number; mediaRole?: ProfileVerificationMemoryMediaRole; decisionType?: ProfileVerificationMemoryDecisionType } = {},
  memory: MemoryUsage = process.memoryUsage(),
) => Object.freeze({
  event: PROFILE_VERIFICATION_MEMORY_DIAGNOSTIC_EVENT,
  stage,
  ...(stage !== "PROFILE_MEDIA_ITEM_COMPLETE" || metadata.mediaIndex === undefined ? {} : { mediaIndex: Math.min(7, Math.max(0, Math.trunc(metadata.mediaIndex))) }),
  ...(stage !== "PROFILE_MEDIA_ITEM_COMPLETE" || metadata.mediaRole === undefined ? {} : { mediaRole: metadata.mediaRole }),
  ...(stage !== "DECISION_APPLIED" || metadata.decisionType === undefined ? {} : { decisionType: metadata.decisionType }),
  rssMiB: toBoundedMiB(memory.rss),
  heapUsedMiB: toBoundedMiB(memory.heapUsed),
  heapTotalMiB: toBoundedMiB(memory.heapTotal),
  externalMiB: toBoundedMiB(memory.external),
  arrayBuffersMiB: toBoundedMiB(memory.arrayBuffers),
});

export const reportProfileVerificationMemory = (
  stage: ProfileVerificationMemoryStage,
  metadata: { mediaIndex?: number; mediaRole?: ProfileVerificationMemoryMediaRole; decisionType?: ProfileVerificationMemoryDecisionType } = {},
) => {
  // Diagnostics must never alter verification or shutdown behavior.
  try { console.log(JSON.stringify(createProfileVerificationMemoryDiagnostic(stage, metadata))); }
  catch { /* Ordinary bounded logging is best effort. */ }
};
