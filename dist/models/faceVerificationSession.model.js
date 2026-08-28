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
exports.FaceVerificationSession = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const schema = new mongoose_1.Schema({
    sessionReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 96 },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    profileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
    verificationRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ProfileVerificationRequest", index: true },
    profileSubmissionVersion: { type: Number, required: true, min: 1, index: true },
    avatarFingerprint: { type: String, required: true, trim: true, minlength: 64, maxlength: 64 },
    status: { type: String, required: true, enum: ["CREATED", "CAPTURING", "CAPTURE_COMPLETE", "CANCELLED", "EXPIRED", "INVALIDATED"], default: "CREATED", index: true },
    isCurrent: { type: Boolean, required: true, default: true, index: true },
    challenges: { type: [String], required: true, immutable: true, validate: { validator: (value) => value.length === 5 && new Set(value).size === 5, message: "Exactly five unique challenges are required" } },
    requiredCaptureCount: { type: Number, required: true, default: 5, immutable: true, min: 5, max: 5 },
    acceptedCaptureCount: { type: Number, required: true, default: 0, min: 0, max: 5 },
    startedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    captureCompletedAt: { type: Date },
    cancelledAt: { type: Date },
    invalidatedAt: { type: Date },
    invalidationCode: { type: String, trim: true, maxlength: 80 },
    cleanupAfter: { type: Date, index: true },
}, { timestamps: true });
schema.index({ profileId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true }, name: "one_current_face_verification_session" });
schema.index({ userId: 1, status: 1, expiresAt: 1 });
schema.index({ verificationRequestId: 1, profileSubmissionVersion: 1 });
exports.FaceVerificationSession = mongoose_1.default.model("FaceVerificationSession", schema);
