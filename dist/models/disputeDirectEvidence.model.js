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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisputeDirectEvidence = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const schema = new mongoose_1.Schema({ evidenceReference: { type: String, required: true, unique: true, index: true, immutable: true, default: () => `DISPUTE_DIRECT_EVIDENCE_${crypto_1.default.randomBytes(10).toString("hex").toUpperCase()}` }, disputeId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Dispute", required: true, index: true, immutable: true }, bookingId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Booking", required: true, index: true, immutable: true }, source: { type: String, enum: ["CUSTOMER", "CREATOR", "ADMIN"], required: true, immutable: true }, uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true }, type: { type: String, enum: ["IMAGE", "DOCUMENT"], required: true, immutable: true }, audience: { type: String, enum: ["ADMIN_ONLY", "CUSTOMER", "CREATOR", "BOTH"], immutable: true }, url: { type: String, required: true, immutable: true }, publicId: { type: String, required: true, immutable: true }, fileName: { type: String, required: true, immutable: true }, mimeType: { type: String, required: true, immutable: true }, fileSize: { type: Number, required: true, min: 0, immutable: true }, note: { type: String, maxlength: 500, immutable: true } }, { timestamps: true });
schema.index({ disputeId: 1, createdAt: 1, _id: 1 });
exports.DisputeDirectEvidence = mongoose_1.default.model("DisputeDirectEvidence", schema);
