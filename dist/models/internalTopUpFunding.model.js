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
exports.InternalTopUpFunding = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const financialLimits_1 = require("../constants/financial/financialLimits");
const internalTopUpFundingStatus_enum_1 = require("../enums/financial/internalTopUpFundingStatus.enum");
const internalTopUpFundingFailureCode_enum_1 = require("../enums/financial/internalTopUpFundingFailureCode.enum");
const schema = new mongoose_1.Schema({
    fundingReference: { type: String, required: true, unique: true, immutable: true, trim: true },
    topUpRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: "WalletTopUpRequest", required: true, unique: true, immutable: true },
    topUpReference: { type: String, required: true, immutable: true, trim: true },
    amount: { type: Number, required: true, immutable: true, min: 1, max: financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT, validate: { validator: Number.isSafeInteger } },
    currency: { type: String, required: true, immutable: true, uppercase: true, enum: supportedCurrencies_1.SUPPORTED_CURRENCIES },
    status: { type: String, required: true, enum: Object.values(internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus), default: internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.CREATED },
    idempotencyKey: { type: String, required: true, unique: true, immutable: true, trim: true },
    requestFingerprint: { type: String, required: true, immutable: true, trim: true, select: false },
    processingStartedAt: Date, succeededAt: Date, failedAt: Date,
    failureCode: { type: String, enum: Object.values(internalTopUpFundingFailureCode_enum_1.InternalTopUpFundingFailureCode) },
    failureReason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false });
exports.InternalTopUpFunding = mongoose_1.default.model("InternalTopUpFunding", schema);
