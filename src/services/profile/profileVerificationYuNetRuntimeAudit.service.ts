import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { ulid } from "ulid";
import { ProfileVerificationYuNetRuntimeAudit, YuNetRunnerAuditOutcome } from "../../models/profileVerificationYuNetRuntimeAudit.model";

export type YuNetRunnerRole = "REFERENCE" | "CAPTURE_0" | "CAPTURE_1" | "CAPTURE_2" | "CAPTURE_3" | "CAPTURE_4" | "SYNTHETIC" | "UNSPECIFIED";
type AuditContext = { verificationReference?: string; jobReference?: string; submissionVersion?: number; attemptCount?: number };
const context = new AsyncLocalStorage<AuditContext>();
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const withYuNetRunnerAuditContext = <T>(value: AuditContext, action: () => Promise<T>) => context.run(value, action);
export const createYuNetRunnerAudit = async (input: { role: YuNetRunnerRole; outcome: YuNetRunnerAuditOutcome; value: unknown; resolvedPath?: string; resolvedPathExists?: boolean }) => {
  const value = input.value;
  const text = typeof value === "string" ? value : undefined;
  const current = context.getStore();
  return ProfileVerificationYuNetRuntimeAudit.create({
    invocationReference: `YUNET_RUNTIME_AUDIT_${ulid()}`,
    ...current,
    role: input.role, processId: process.pid, parentProcessId: process.ppid, cwd: process.cwd(), ...(process.env.NODE_ENV ? { nodeEnv: process.env.NODE_ENV } : {}),
    envHasOwnProperty: Object.prototype.hasOwnProperty.call(process.env, "STHN_YUNET_MODEL_PATH"), envValueType: typeof value, envValuePresent: Boolean(value), envValueLength: text?.length ?? 0, envValueTrimmedLength: text?.trim().length ?? 0,
    ...(text ? { configuredPathHash: crypto.createHash("sha256").update(text).digest("hex") } : {}), ...(input.resolvedPath ? { resolvedPath: input.resolvedPath } : {}), ...(typeof input.resolvedPathExists === "boolean" ? { resolvedPathExists: input.resolvedPathExists } : {}),
    outcome: input.outcome, expiresAt: new Date(Date.now() + RETENTION_MS),
  });
};
export const updateYuNetRunnerAudit = (id: unknown, outcome: YuNetRunnerAuditOutcome) => ProfileVerificationYuNetRuntimeAudit.updateOne({ _id: id }, { $set: { outcome } }).exec();
