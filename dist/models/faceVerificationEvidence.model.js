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
exports.FaceVerificationEvidence = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const schema = new mongoose_1.Schema({
    evidenceReference: { type: String, required: true, unique: true, index: true, trim: true, maxlength: 96 },
    sessionId: { type: mongoose_1.Schema.Types.ObjectId, ref: "FaceVerificationSession", required: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    profileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UserProfile", required: true, index: true },
    verificationRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ProfileVerificationRequest", index: true },
    challengeIndex: { type: Number, required: true, min: 0, max: 4 },
    challenge: { type: String, required: true, enum: ["NEUTRAL", "TURN_LEFT", "TURN_RIGHT", "LOOK_UP", "LOOK_DOWN", "BLINK"] },
    cloudinaryPublicId: { type: String, required: true, unique: true, trim: true, maxlength: 240 },
    cloudinaryResourceType: { type: String, required: true, enum: ["image"], default: "image" },
    mimeType: { type: String, trim: true, maxlength: 80 },
    bytes: { type: Number, min: 1 },
    format: { type: String, trim: true, maxlength: 20 },
    status: { type: String, required: true, enum: ["UPLOADING", "STORED", "DELETE_PENDING", "DELETED"], default: "UPLOADING", index: true },
    captureReceivedAt: { type: Date }, cleanupAfter: { type: Date, index: true }, deletedAt: { type: Date },
}, { timestamps: true });
schema.index({ sessionId: 1, challengeIndex: 1 }, { unique: true, name: "one_face_evidence_per_session_challenge" });
schema.index({ status: 1, cleanupAfter: 1 });
exports.FaceVerificationEvidence = mongoose_1.default.model("FaceVerificationEvidence", schema);
