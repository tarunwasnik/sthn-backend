"use strict";
//backend/src/models/adminControl.model.ts
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
exports.AdminControl = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const AdminControlSchema = new mongoose_1.Schema({
    scope: {
        type: String,
        enum: ["GLOBAL", "ACTION", "EMERGENCY"],
        required: true,
        index: true,
    },
    mode: {
        type: String,
        required: true,
    },
    // Action-level control
    actionKey: {
        type: String,
        index: true,
        sparse: true,
    },
    // Emergency control
    appliesTo: {
        type: String,
        enum: ["ALL", "HIGH_RISK"],
        sparse: true,
    },
    reason: {
        type: String,
        required: true,
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        ref: "Admin",
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true,
    },
    /**
     * TTL-enforced expiry.
     * Mongo will auto-delete expired controls.
     */
    expiresAt: {
        type: Date,
        index: {
            expireAfterSeconds: 0,
        },
    },
}, {
    versionKey: false,
});
// ----------------------------------
// Indexes for fast evaluation
// ----------------------------------
// Ensure fast lookup of global controls
AdminControlSchema.index({ scope: 1, createdAt: -1 });
// Ensure fast lookup of action-specific controls
AdminControlSchema.index({ scope: 1, actionKey: 1, createdAt: -1 });
// Ensure fast lookup of emergency controls
AdminControlSchema.index({ scope: 1, appliesTo: 1, createdAt: -1 });
exports.AdminControl = mongoose_1.default.models.AdminControl ||
    mongoose_1.default.model("AdminControl", AdminControlSchema);
