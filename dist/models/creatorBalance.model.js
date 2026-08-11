"use strict";
// backend/src/models/creatorBalance.model.ts
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
exports.CreatorBalance = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const CreatorBalanceSchema = new mongoose_1.Schema({
    creatorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    currency: {
        type: String,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
        required: true,
        uppercase: true,
        immutable: true,
    },
    pendingBalance: {
        type: Number,
        default: 0,
        min: 0,
    },
    lockedBalance: {
        type: Number,
        default: 0,
        min: 0,
    },
    reservedBalance: { type: Number, default: 0, min: 0 },
    availableBalance: {
        type: Number,
        default: 0,
        min: 0,
    },
    payoutPendingBalance: {
        type: Number,
        default: 0,
        min: 0,
    },
    lifetimeGross: {
        type: Number,
        default: 0,
        min: 0,
    },
    lifetimeNet: {
        type: Number,
        default: 0,
        min: 0,
    },
    lifetimeCommission: {
        type: Number,
        default: 0,
        min: 0,
    },
    lifetimeRefunded: {
        type: Number,
        default: 0,
        min: 0,
    },
    lifetimePaidOut: {
        type: Number,
        default: 0,
        min: 0,
    },
    lastCalculatedAt: Date,
}, {
    timestamps: true,
});
/* -------------------------------------------------------------------------- */
/* Indexes */
/* -------------------------------------------------------------------------- */
CreatorBalanceSchema.index({ creatorId: 1 });
CreatorBalanceSchema.index({ availableBalance: -1 });
CreatorBalanceSchema.index({ pendingBalance: -1 });
CreatorBalanceSchema.index({ payoutPendingBalance: -1 });
exports.CreatorBalance = mongoose_1.default.model("CreatorBalance", CreatorBalanceSchema);
