"use strict";
// backend/src/models/booking.model.ts
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
exports.Booking = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BookingSchema = new mongoose_1.Schema({
    slotIds: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Slot",
            required: true,
        },
    ],
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    serviceId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "CreatorService",
        required: true,
        index: true,
    },
    serviceTitle: {
        type: String,
        required: true,
        immutable: true,
    },
    durationMinutes: {
        type: Number,
        required: true,
        immutable: true,
    },
    price: {
        type: Number,
        required: true,
        immutable: true,
    },
    currency: {
        type: String,
        required: true,
        immutable: true,
    },
    status: {
        type: String,
        enum: [
            "REQUESTED",
            "CONFIRMED",
            "REJECTED",
            "CANCELLED",
            "EXPIRED",
            "COMPLETED",
        ],
        default: "REQUESTED",
        index: true,
    },
    paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "REFUNDED"],
        default: "PAID",
        index: true,
    },
    isPayable: {
        type: Boolean,
        default: false,
        index: true,
    },
    isPayoutEligible: {
        type: Boolean,
        default: false,
        index: true,
    },
    isFinancialLocked: {
        type: Boolean,
        default: false,
        index: true,
    },
    creatorEarningSnapshot: Number,
    platformCommissionSnapshot: Number,
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    hasInteracted: {
        type: Boolean,
        default: false,
        index: true,
    },
    interactionStartedAt: Date,
    lastSeen: {
        user: Date,
        creator: Date,
    },
    // ✅ ADD THIS BLOCK
    completedAt: {
        type: Date,
        index: true,
    },
}, { timestamps: true });
/* Indexes */
BookingSchema.index({ creatorId: 1, status: 1 });
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ slotIds: 1 });
BookingSchema.index({ serviceId: 1 });
exports.Booking = mongoose_1.default.model("Booking", BookingSchema);
