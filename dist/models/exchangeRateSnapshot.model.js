"use strict";
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
exports.ExchangeRateSnapshot = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const fxRate_constants_1 = require("../constants/financial/fxRate.constants");
const exchangeRateSnapshotStatus_enum_1 = require("../enums/financial/exchangeRateSnapshotStatus.enum");
const schema = new mongoose_1.Schema({
    snapshotReference: { type: String, required: true, unique: true,
        immutable: true, trim: true },
    snapshotKey: { type: String, required: true, unique: true,
        immutable: true, select: false },
    provider: { type: String, required: true, immutable: true, trim: true,
        maxlength: 64 },
    providerReference: { type: String, immutable: true, trim: true,
        maxlength: 160 },
    baseCurrency: { type: String, required: true, immutable: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    quoteCurrency: { type: String, required: true, immutable: true,
        enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    rateValue: { type: String, required: true, immutable: true,
        validate: /^\d+$/ },
    rateScale: { type: Number, required: true, immutable: true, min: 0,
        max: fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
    inverseRateValue: { type: String, required: true, immutable: true,
        validate: /^\d+$/ },
    inverseRateScale: { type: Number, required: true, immutable: true, min: 0,
        max: fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE, validate: Number.isSafeInteger },
    effectiveDate: { type: Date, required: true, immutable: true },
    providerPublishedAt: { type: Date, immutable: true },
    fetchedAt: { type: Date, required: true, immutable: true },
    validFrom: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    status: { type: String, required: true,
        enum: Object.values(exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus) },
    supersededAt: Date,
    supersededByReference: { type: String, trim: true },
    responseFingerprint: { type: String, required: true, immutable: true,
        select: false },
    snapshotFingerprint: { type: String, required: true, immutable: true,
        select: false },
    createdByType: { type: String, required: true, immutable: true,
        enum: ["ADMIN", "SYSTEM"] },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", immutable: true,
        select: false },
    version: { type: Number, required: true, default: 1, immutable: true,
        validate: Number.isSafeInteger },
}, { timestamps: true, versionKey: false });
schema.index({ provider: 1, baseCurrency: 1, quoteCurrency: 1, status: 1 }, { unique: true, partialFilterExpression: {
        status: exchangeRateSnapshotStatus_enum_1.ExchangeRateSnapshotStatus.ACTIVE,
    }, name: "unique_active_fx_pair_provider" });
schema.index({ provider: 1, baseCurrency: 1, quoteCurrency: 1,
    effectiveDate: -1 }, { name: "fx_pair_effective_date" });
schema.index({ status: 1, expiresAt: 1 }, { name: "fx_status_expiry" });
schema.index({ createdAt: -1 }, { name: "fx_created_at" });
exports.ExchangeRateSnapshot = mongoose_1.default.model("ExchangeRateSnapshot", schema);
