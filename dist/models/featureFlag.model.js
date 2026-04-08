"use strict";
// backend/src/models/featureFlag.model.ts
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
exports.FeatureFlag = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const FeatureFlagSchema = new mongoose_1.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    description: {
        type: String,
    },
    enabled: {
        type: Boolean,
        default: false,
    },
    scope: {
        type: String,
        enum: ["GLOBAL", "ROLE", "USER"],
        default: "GLOBAL",
    },
    conditions: {
        roles: [{ type: String }],
        userIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }],
    },
    // 🔔 Phase 30.6.5 — Alert configuration
    alertConfig: {
        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "low",
        },
        threshold: {
            type: Number,
            default: 50,
        },
        windowMinutes: {
            type: Number,
            default: 30,
        },
    },
    // 🧯 Phase 30.6.9 — Auto-disable (explicit opt-in)
    autoDisableOnCritical: {
        enabled: {
            type: Boolean,
            default: false,
        },
        afterMinutes: {
            type: Number,
            default: 15,
        },
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Admin",
        required: true,
    },
    updatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Admin",
    },
}, { timestamps: true });
exports.FeatureFlag = mongoose_1.default.model("FeatureFlag", FeatureFlagSchema);
