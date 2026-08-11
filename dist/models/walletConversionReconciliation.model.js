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
exports.WalletConversionReconciliation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionOperationalClassification_enum_1 = require("../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalSeverity_enum_1 = require("../enums/financial/walletConversionOperationalSeverity.enum");
const schema = new mongoose_1.Schema({
    reconciliationReference: { type: String, required: true, immutable: true,
        trim: true },
    reconciliationKey: { type: String, required: true, immutable: true,
        trim: true, select: false },
    conversionRequestId: { type: mongoose_1.Schema.Types.ObjectId,
        ref: "WalletConversionRequest", required: true, immutable: true,
        select: false },
    conversionReference: { type: String, required: true, immutable: true,
        trim: true },
    classification: { type: String, required: true,
        enum: Object.values(walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification) },
    severity: { type: String, required: true,
        enum: Object.values(walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity) },
    issues: { type: [{ type: String, trim: true, maxlength: 96 }], default: [] },
    retryPerformed: { type: Boolean, required: true, default: false },
    repairPerformed: { type: Boolean, required: true, default: false },
    inspectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true,
        immutable: true, select: false },
    inspectedAt: { type: Date, required: true },
    version: { type: Number, required: true, default: 1, min: 1 },
}, { timestamps: true, versionKey: false });
schema.index({ reconciliationReference: 1 }, { unique: true });
schema.index({ reconciliationKey: 1 }, { unique: true });
schema.index({ conversionRequestId: 1 }, { unique: true });
schema.index({ conversionReference: 1 }, { unique: true });
schema.index({ classification: 1, createdAt: -1 });
exports.WalletConversionReconciliation = mongoose_1.default.model("WalletConversionReconciliation", schema);
