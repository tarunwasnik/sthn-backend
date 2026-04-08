"use strict";
// backend/src/models/slot.model.ts
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
exports.Slot = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const SlotSchema = new mongoose_1.Schema({
    availabilityId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Availability",
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
    startTime: {
        type: Date,
        required: true,
        index: true,
    },
    endTime: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ["AVAILABLE", "LOCKED", "BOOKED", "CANCELLED"],
        default: "AVAILABLE",
        index: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
        index: true,
    },
}, { timestamps: true });
/**
 * 🔐 HARD SAFETY GUARANTEE
 * Prevent duplicate slot start times for the same creator
 */
SlotSchema.index({ creatorId: 1, startTime: 1 }, { unique: true });
/**
 * ⚡ Discovery & Availability Queries
 */
SlotSchema.index({ creatorId: 1, status: 1, startTime: 1 });
/**
 * ⚡ Booking Lock Queries
 */
SlotSchema.index({ status: 1, startTime: 1 });
/**
 * ⚡ Service based queries
 */
SlotSchema.index({ serviceId: 1, status: 1, startTime: 1 });
exports.Slot = mongoose_1.default.model("Slot", SlotSchema);
