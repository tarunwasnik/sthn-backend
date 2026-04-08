"use strict";
//backend/src/models/review.model.ts
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
exports.Review = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ReviewSchema = new mongoose_1.Schema({
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        index: true,
    },
    reviewerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    revieweeId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ["USER_TO_CREATOR", "CREATOR_TO_USER"],
        required: true,
        index: true,
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        index: true,
    },
    comment: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    reportFlag: {
        type: Boolean,
        default: false,
        index: true,
    },
    /* =========================
       🔥 TRUST SYSTEM FIELDS
    ========================= */
    verified: {
        type: Boolean,
        default: false,
        index: true,
    },
    trustScore: {
        type: Number,
        default: 1,
        min: 0,
        max: 1,
        index: true,
    },
    reports: {
        type: Number,
        default: 0,
    },
    isFlagged: {
        type: Boolean,
        default: false,
        index: true,
    },
}, { timestamps: true });
/**
 * Prevent duplicate reviews from same reviewer
 */
ReviewSchema.index({ bookingId: 1, reviewerId: 1 }, { unique: true });
/**
 * 🔥 Optimized compound index for queries
 */
ReviewSchema.index({
    revieweeId: 1,
    role: 1,
    trustScore: 1,
    isFlagged: 1,
    createdAt: -1,
});
exports.Review = mongoose_1.default.model("Review", ReviewSchema);
