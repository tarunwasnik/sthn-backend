"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveCreatorWithdrawalFinalizationIdentity = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const creatorWithdrawalFinalizationOutcome_enum_1 = require("../../enums/financial/creatorWithdrawalFinalizationOutcome.enum");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
const deriveCreatorWithdrawalFinalizationIdentity = (input) => {
    const finalizationFingerprint = hash(JSON.stringify({
        version: 1,
        withdrawalReference: input.withdrawalReference,
        withdrawalKey: input.withdrawalKey,
        creatorId: input.creatorId.toString(),
        creatorUserId: input.creatorUserId.toString(),
        walletId: input.walletId.toString(),
        destinationId: input.destinationId.toString(),
        destinationReference: input.destinationReference,
        amount: input.amount,
        currency: input.currency,
        providerRequestReference: input.providerRequestReference,
        providerRequestKey: input.providerRequestKey,
        providerFingerprint: input.providerFingerprint,
        providerReference: input.providerReference,
        providerExecutionReference: input.providerExecutionReference,
        providerExecutionFingerprint: input.providerExecutionFingerprint,
        providerTerminalStatus: input.providerTerminalStatus,
        reservationTransactionId: input.reservationTransactionId,
        outcome: input.outcome,
    }));
    const finalizationKey = `creator-withdrawal-finalization:${input.withdrawalReference}:` +
        input.outcome;
    const finalizationTransactionId = `creator-withdrawal-finalization:${input.withdrawalReference}:` +
        input.outcome.toLowerCase();
    const projectionOperationKey = `${finalizationTransactionId}:wallet-projection`;
    return {
        finalizationFingerprint,
        finalizationKey,
        finalizationReference: `CWF-${hash(finalizationKey).slice(0, 20).toUpperCase()}`,
        finalizationTransactionId,
        reservedDebitPostingKey: `${finalizationTransactionId}:withdrawal-reserved-debit`,
        terminalCreditPostingKey: input.outcome ===
            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? `${finalizationTransactionId}:provider-outflow-credit`
            : `${finalizationTransactionId}:wallet-available-credit`,
        projectionOperationKey,
        projectionReference: `WPO-${hash(projectionOperationKey).slice(0, 16).toUpperCase()}`,
    };
};
exports.deriveCreatorWithdrawalFinalizationIdentity = deriveCreatorWithdrawalFinalizationIdentity;
