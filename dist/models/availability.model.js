"use strict";
// backend/src/models/availability.model.ts
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
exports.Availability = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const AvailabilitySchema = new mongoose_1.Schema({
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
    date: {
        type: Date,
        required: true,
        index: true,
    },
    startTime: {
        type: String,
        required: true,
    },
    endTime: {
        type: String,
        required: true,
    },
    slotDurationMinutes: {
        type: Number,
        required: true,
        default: 60,
        min: 30,
        max: 480,
    },
    status: {
        type: String,
        enum: ["ACTIVE", "CANCELLED", "EXPIRED"],
        default: "ACTIVE",
        index: true,
    },
}, { timestamps: true });
AvailabilitySchema.index({ creatorId: 1, date: 1 });
AvailabilitySchema.index({ creatorId: 1, serviceId: 1 });
/* Prevent duplicate availability windows */
AvailabilitySchema.index({ creatorId: 1, serviceId: 1, date: 1, startTime: 1, endTime: 1 }, { unique: true });
exports.Availability = mongoose_1.default.model("Availability", AvailabilitySchema);
