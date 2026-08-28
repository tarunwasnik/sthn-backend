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
exports.ProfileVerificationRequest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ProfileVerificationRequestSchema = new mongoose_1.Schema({
    verificationReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 80 },
    profileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    profileSubmissionVersion: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: ["PENDING", "PROCESSING", "ADMIN_REVIEW_REQUIRED", "APPROVED", "REJECTED", "EXPIRED"], default: "PENDING", index: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
    submittedAt: { type: Date, required: true, immutable: true, default: Date.now, index: true },
    expiredAt: { type: Date, index: true },
    processingStartedAt: { type: Date },
    adminReviewRequiredAt: { type: Date, index: true },
    adminReviewReasonCode: { type: String, enum: ["FACE_MATCH_UNCERTAIN", "LIVENESS_UNCERTAIN", "TEXT_MODERATION_UNCERTAIN", "IMAGE_MODERATION_UNCERTAIN", "CONFLICTING_CHECKS", "PROCESSING_TIMEOUT", "MODEL_FAILURE", "OTHER"] },
    adminReviewReason: { type: String, trim: true, maxlength: 500 },
    decision: { type: String, enum: ["APPROVE", "REJECT"] },
    decisionAuthority: { type: String, enum: ["ADMIN", "AI"] },
    decisionReason: { type: String, trim: true, maxlength: 2000 },
    decidedAt: { type: Date },
    decidedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
ProfileVerificationRequestSchema.index({ profileId: 1 }, { unique: true, partialFilterExpression: { isActive: true }, name: "one_active_profile_verification_request" });
ProfileVerificationRequestSchema.index({ profileId: 1, attemptNumber: -1 });
ProfileVerificationRequestSchema.index({ status: 1, submittedAt: -1 });
ProfileVerificationRequestSchema.index({ status: 1, adminReviewRequiredAt: -1 });
exports.ProfileVerificationRequest = mongoose_1.default.model("ProfileVerificationRequest", ProfileVerificationRequestSchema);
