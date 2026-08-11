"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const mongoose_1 = require("mongoose");
const financialLimits_1 = require("../constants/financial/financialLimits");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const nonNegativeMinorUnit = {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: "Wallet monetary values must be safe integer minor units.",
    },
};
const walletSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
    },
    currency: {
        type: String,
        required: true,
        default: "INR",
        immutable: true,
        uppercase: true,
        trim: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES,
    },
    currentBalance: nonNegativeMinorUnit,
    availableBalance: nonNegativeMinorUnit,
    pendingBalance: nonNegativeMinorUnit,
    withdrawableBalance: nonNegativeMinorUnit,
    lockedBalance: nonNegativeMinorUnit,
    reservedBalance: nonNegativeMinorUnit,
    lifetimeEarnings: nonNegativeMinorUnit,
    totalWithdrawn: nonNegativeMinorUnit,
    totalRefunded: nonNegativeMinorUnit,
    platformFees: nonNegativeMinorUnit,
    projectionVersion: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        validate: {
            validator: (value) => Number.isSafeInteger(value),
            message: "Wallet projection version must be a safe integer.",
        },
    },
    lastSyncedAt: { type: Date },
}, { timestamps: true, versionKey: false });
/** One currency-isolated projection bucket per user. */
walletSchema.index({ userId: 1, currency: 1 }, { unique: true });
exports.Wallet = (0, mongoose_1.model)("Wallet", walletSchema);
