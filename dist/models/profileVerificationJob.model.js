"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileVerificationJob = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ProfileVerificationJobSchema = new mongoose_1.Schema({
    jobReference: { type: String, required: true, unique: true, trim: true, maxlength: 96, index: true },
    verificationRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ProfileVerificationRequest", required: true, index: true },
    profileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    profileSubmissionVersion: { type: Number, required: true, min: 1 },
    jobType: { type: String, required: true, enum: ["PROFILE_VERIFICATION_PROCESSING"], index: true },
    status: { type: String, required: true, enum: ["PENDING", "RUNNING", "RETRY_WAIT", "COMPLETED", "FAILED"], default: "PENDING", index: true },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    maxRetryCount: { type: Number, required: true, default: 3, min: 1, max: 10 },
    nextAttemptAt: { type: Date, required: true, default: Date.now, index: true },
    claimedAt: { type: Date },
    leaseExpiresAt: { type: Date, index: true },
    workerId: { type: String, trim: true, maxlength: 160 },
    lastStartedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    lastErrorCode: { type: String, trim: true, maxlength: 80 },
    lastErrorMessage: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });
ProfileVerificationJobSchema.index({ verificationRequestId: 1, jobType: 1 }, { unique: true, name: "one_profile_verification_processing_job" });
ProfileVerificationJobSchema.index({ status: 1, nextAttemptAt: 1 });
ProfileVerificationJobSchema.index({ status: 1, leaseExpiresAt: 1 });
ProfileVerificationJobSchema.index({ profileId: 1, profileSubmissionVersion: 1 });
exports.ProfileVerificationJob = mongoose_1.default.model("ProfileVerificationJob", ProfileVerificationJobSchema);
