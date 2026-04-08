"use strict";
//backend/src/models/adminThrottle.model.ts
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
exports.AdminThrottle = void 0;
/**
 * Phase 27 — Admin Throttle Model
 *
 * Represents temporary, auto-expiring restrictions applied to admins
 * as a result of detected abuse signals.
 *
 * Throttles are:
 * - actor-scoped
 * - time-bounded
 * - explainable
 * - reversible
 * - audit-friendly
 */
const mongoose_1 = __importStar(require("mongoose"));
const AdminThrottleSchema = new mongoose_1.Schema({
    adminId: {
        type: String,
        required: true,
        index: true,
    },
    signalType: {
        type: String,
        required: true,
        index: true,
    },
    derivedFromAlertType: {
        type: String,
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    throttleUntil: {
        type: Date,
        required: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 }, // 🔥 TTL auto-expiry
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    versionKey: false,
});
exports.AdminThrottle = mongoose_1.default.model("AdminThrottle", AdminThrottleSchema);
