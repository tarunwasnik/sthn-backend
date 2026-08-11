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
exports.WithdrawalCreatorBalanceProjectionOperation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const withdrawalProjectionOperationType_enum_1 = require("../enums/financial/withdrawalProjectionOperationType.enum");
const schema = new mongoose_1.Schema({ creatorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, immutable: true }, withdrawalId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Withdrawal", immutable: true }, operationReference: { type: String, required: true, unique: true, immutable: true, trim: true }, operationType: { type: String, enum: Object.values(withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType), required: true, immutable: true }, amount: { type: Number, required: true, immutable: true, min: 1 }, currency: { type: String, required: true, immutable: true }, sourceReference: { type: String, required: true, immutable: true }, ledgerTransactionReference: { type: String, immutable: true }, appliedAt: { type: Date, required: true, immutable: true } }, { timestamps: true });
exports.WithdrawalCreatorBalanceProjectionOperation = mongoose_1.default.model("WithdrawalCreatorBalanceProjectionOperation", schema);
