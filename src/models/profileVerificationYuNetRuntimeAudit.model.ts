import { Schema, model } from "mongoose";

export type YuNetRunnerAuditOutcome = "ENV_ABSENT" | "PATH_RESOLVED" | "MODEL_FILE_MISSING" | "MODEL_READ_FAILED" | "SESSION_LOAD_FAILED" | "SESSION_LOAD_SUCCEEDED" | "SESSION_REUSED";

const schema = new Schema({
  invocationReference: { type: String, required: true, unique: true, immutable: true, maxlength: 96, index: true },
  verificationReference: { type: String, maxlength: 96, index: true },
  jobReference: { type: String, maxlength: 96, index: true },
  submissionVersion: { type: Number, min: 1, max: 1000000 },
  attemptCount: { type: Number, min: 1, max: 10 },
  role: { type: String, required: true, enum: ["REFERENCE", "CAPTURE_0", "CAPTURE_1", "CAPTURE_2", "CAPTURE_3", "CAPTURE_4", "SYNTHETIC", "UNSPECIFIED"], index: true },
  processId: { type: Number, required: true }, parentProcessId: { type: Number }, cwd: { type: String, required: true, maxlength: 512 }, nodeEnv: { type: String, maxlength: 80 },
  envHasOwnProperty: { type: Boolean, required: true }, envValueType: { type: String, required: true, maxlength: 32 }, envValuePresent: { type: Boolean, required: true }, envValueLength: { type: Number, required: true, min: 0, max: 4096 }, envValueTrimmedLength: { type: Number, required: true, min: 0, max: 4096 },
  configuredPathHash: { type: String, maxlength: 64 }, resolvedPath: { type: String, maxlength: 512 }, resolvedPathExists: { type: Boolean },
  outcome: { type: String, required: true, enum: ["ENV_ABSENT", "PATH_RESOLVED", "MODEL_FILE_MISSING", "MODEL_READ_FAILED", "SESSION_LOAD_FAILED", "SESSION_LOAD_SUCCEEDED", "SESSION_REUSED"] },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, strict: "throw" });

schema.index({ createdAt: -1 }, { name: "yunet_runtime_audit_recent" });
export const ProfileVerificationYuNetRuntimeAudit = model("ProfileVerificationYuNetRuntimeAudit", schema);
