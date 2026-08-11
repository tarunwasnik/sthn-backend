"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletProjectionOperation = void 0;
const mongoose_1 = require("mongoose");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const signedMinorUnit = {
    type: Number,
    required: true,
    immutable: true,
    min: -financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT,
    validate: {
        validator: (value) => Number.isSafeInteger(value),
        message: "Projection deltas must be safe integer minor units.",
    },
};
const WalletProjectionOperationSchema = new mongoose_1.Schema({
    operationReference: { type: String, required: true, immutable: true, unique: true, trim: true },
    walletId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Wallet", required: true, immutable: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
    currency: { type: String, required: true, immutable: true, uppercase: true, trim: true, enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    operationKey: { type: String, required: true, immutable: true, trim: true, validate: { validator: (value) => !!value?.trim(), message: "Operation key is required." } },
    fingerprint: { type: String, required: true, immutable: true, trim: true, select: false, validate: { validator: (value) => !!value?.trim(), message: "Fingerprint is required." } },
    deltas: {
        availableBalance: signedMinorUnit,
        reservedBalance: signedMinorUnit,
        lockedBalance: signedMinorUnit,
    },
    ledgerEntryIds: { type: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "LedgerEntry" }], default: [], immutable: true },
    projectionVersion: { type: Number, required: true, immutable: true, min: 0, validate: { validator: (value) => Number.isSafeInteger(value), message: "Projection version must be a non-negative safe integer." } },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
/** A key identifies exactly one immutable wallet projection effect globally. */
WalletProjectionOperationSchema.index({ operationKey: 1 }, { unique: true });
WalletProjectionOperationSchema.index({ walletId: 1, createdAt: -1 });
exports.WalletProjectionOperation = (0, mongoose_1.model)("WalletProjectionOperation", WalletProjectionOperationSchema);
