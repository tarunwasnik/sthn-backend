"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalPayoutLifecycleService = exports.WithdrawalPayoutLifecycleService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const payoutSourceType_enum_1 = require("../../enums/financial/payoutSourceType.enum");
const payoutStatus_enum_1 = require("../../enums/financial/payoutStatus.enum");
const withdrawalStatus_enum_1 = require("../../enums/financial/withdrawalStatus.enum");
const PayoutError_1 = require("../../errors/financial/PayoutError");
const payout_repository_1 = require("../../repositories/payout.repository");
const payout_service_1 = require("./payout.service");
const payoutProviderRegistry_service_1 = require("./payoutProviderRegistry.service");
const withdrawal_service_1 = require("./withdrawal.service");
const creatorBalance_service_1 = require("./creatorBalance.service");
const ledger_service_1 = require("./ledger.service");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const withdrawalDestinationExecution_service_1 = require("./withdrawalDestinationExecution.service");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const withdrawalCreatorBalanceProjectionOperation_repository_1 = require("../../repositories/withdrawalCreatorBalanceProjectionOperation.repository");
const withdrawalProjectionOperationType_enum_1 = require("../../enums/financial/withdrawalProjectionOperationType.enum");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const payoutDestinationCrypto_service_1 = require("../security/payoutDestinationCrypto.service");
class WithdrawalPayoutLifecycleService {
    constructor(payouts = payout_service_1.payoutService, withdrawals = withdrawal_service_1.withdrawalService, repository = payout_repository_1.payoutRepository, balances = creatorBalance_service_1.creatorBalanceService, ledger = ledger_service_1.ledgerService) {
        this.payouts = payouts;
        this.withdrawals = withdrawals;
        this.repository = repository;
        this.balances = balances;
        this.ledger = ledger;
    }
    async auditSafely(params) { try {
        await (0, auditLog_service_1.createFinancialAudit)(params);
    }
    catch (error) {
        console.error("Financial audit write failed", error);
    } }
    async initializeReservedWithdrawalPayout(withdrawalId) {
        const preparation = await this.preparePayout(withdrawalId);
        await this.auditSafely({ action: auditAction_enum_1.AuditAction.PAYOUT_PROCESS_REQUESTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: preparation.payout._id, financialContext: { domain: "PAYOUT", primaryReference: preparation.payout.payoutReference, payoutReference: preparation.payout.payoutReference, withdrawalReference: preparation.withdrawal.withdrawalReference, amount: preparation.withdrawal.amount, currency: preparation.withdrawal.currency, provider: preparation.payout.provider }, transition: { outcome: "PROCESSING" } });
        if (preparation.withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING &&
            preparation.payout.status === payoutStatus_enum_1.PayoutStatus.PROCESSING &&
            preparation.payout.providerPayoutId) {
            return preparation;
        }
        const provider = payoutProviderRegistry_service_1.payoutProviderRegistry.get(preparation.payout.provider);
        const destination = await withdrawalDestinationExecution_service_1.withdrawalDestinationExecutionService.getExecutionDestination(withdrawalId);
        const providerResponse = await provider.initializePayout({
            payoutId: preparation.payout._id.toString(),
            payoutReference: preparation.payout.payoutReference,
            withdrawalReference: preparation.withdrawal.withdrawalReference,
            creatorId: preparation.withdrawal.creatorId.toString(),
            amount: {
                amount: preparation.withdrawal.amount,
                currency: preparation.withdrawal.currency,
            },
            provider: preparation.payout.provider,
            idempotencyKey: preparation.payout.idempotencyKey,
            destination,
        });
        this.verifyProviderInitializationIdentity(preparation.withdrawal, preparation.payout, destination, providerResponse);
        await this.auditSafely({ action: auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_REQUESTED, actor: { type: "PROVIDER", reference: preparation.payout.provider }, entityType: "PAYOUT", entityId: preparation.payout._id, financialContext: { domain: "PAYOUT", primaryReference: preparation.payout.payoutReference, payoutReference: preparation.payout.payoutReference, withdrawalReference: preparation.withdrawal.withdrawalReference, amount: preparation.withdrawal.amount, currency: preparation.withdrawal.currency, provider: preparation.payout.provider, providerReference: providerResponse.providerPayoutId }, transition: { outcome: "PROCESSING" } });
        return this.synchronizeProviderInitialization(withdrawalId, preparation.payout._id.toString(), providerResponse);
    }
    verifyProviderInitializationIdentity(withdrawal, payout, destination, response) {
        const identity = response.initializationIdentity;
        const expectedFingerprint = this.destinationFingerprint(destination);
        if (!identity ||
            response.providerPayoutId !== identity.providerPayoutId ||
            !identity.providerPayoutId ||
            identity.payoutId !== payout._id.toString() ||
            identity.withdrawalReference !== withdrawal.withdrawalReference ||
            identity.amount.amount !== withdrawal.amount ||
            identity.amount.currency !== withdrawal.currency ||
            identity.destinationSnapshotVersion !== destination.snapshotVersion ||
            identity.destinationReference !== destination.destinationReference ||
            !this.fingerprintsEqual(identity.destinationFingerprint, expectedFingerprint)) {
            throw new PayoutError_1.PayoutError("Provider payout initialization identity conflicts with the withdrawal.", "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_CONFLICT");
        }
    }
    destinationFingerprint(destination) {
        if (destination.type === "BANK_ACCOUNT") {
            const execution = destination.executionDestination;
            return payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(JSON.stringify({ type: execution.type, accountHolderName: execution.accountHolderName, accountNumber: execution.accountNumber, ifsc: execution.ifsc }));
        }
        const execution = destination.executionDestination;
        return payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(JSON.stringify({ type: execution.type, upiId: execution.upiId }));
    }
    fingerprintsEqual(first, second) {
        const left = Buffer.from(first, "utf8");
        const right = Buffer.from(second, "utf8");
        return left.length === right.length && crypto_1.default.timingSafeEqual(left, right);
    }
    async processInitializedWithdrawalPayout(withdrawalId) {
        const current = await this.getProcessingRelationship(withdrawalId);
        if (current.withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED ||
            current.withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
            return current;
        }
        if (!current.payout.providerPayoutId) {
            throw new PayoutError_1.PayoutError("Payout provider initialization is incomplete.");
        }
        const provider = payoutProviderRegistry_service_1.payoutProviderRegistry.get(current.payout.provider);
        const result = await provider.getPayoutResult({
            payoutId: current.payout._id.toString(),
            providerPayoutId: current.payout.providerPayoutId,
        });
        this.validateProviderResult(current.payout, result);
        if (!result.terminal) {
            await this.auditSafely({ action: auditAction_enum_1.AuditAction.PAYOUT_OUTCOME_UNKNOWN, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { fromStatus: current.payout.status, toStatus: current.payout.status, outcome: "UNKNOWN" } });
            return current;
        }
        if (result.outcome === "COMPLETED") {
            return this.finalizeSuccess(withdrawalId, result);
        }
        return this.finalizeFailure(withdrawalId, result);
    }
    async getProcessingRelationship(withdrawalId) {
        const withdrawal = await this.withdrawals.getWithdrawal(withdrawalId);
        if (!withdrawal.payoutId) {
            throw new PayoutError_1.PayoutError("Withdrawal payout relationship is missing.");
        }
        const payout = await this.repository.findById(withdrawal.payoutId.toString());
        if (!payout ||
            payout.sourceType !== payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL ||
            !payout.withdrawalId ||
            payout.withdrawalId.toString() !== withdrawalId) {
            throw new PayoutError_1.PayoutError("Withdrawal has a conflicting payout relationship.");
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
            throw new PayoutError_1.PayoutError("Withdrawal must be processing before terminal payout processing.");
        }
        return { withdrawal, payout };
    }
    validateProviderResult(payout, result) {
        if (result.providerPayoutId !== payout.providerPayoutId) {
            throw new PayoutError_1.PayoutError("Provider payout identifier conflicts with payout.");
        }
        if (result.amount.amount !== payout.amount ||
            result.amount.currency !== payout.currency) {
            throw new PayoutError_1.PayoutError("Provider payout amount or currency conflicts with payout.");
        }
    }
    async finalizeSuccess(withdrawalId, result) {
        const session = await mongoose_1.default.startSession();
        let finalized = null;
        try {
            await session.withTransaction(async () => {
                const current = await this.getProcessingRelationshipInSession(withdrawalId, session);
                if (current.withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED) {
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { outcome: "REPLAYED" }, session });
                    finalized = current;
                    return;
                }
                const payoutTx = `withdrawal:${current.withdrawal.withdrawalReference}:paid`;
                await this.ledger.createDebit({
                    payoutId: current.payout._id.toString(),
                    userId: current.withdrawal.creatorId.toString(),
                    transactionId: payoutTx,
                    account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYOUT_RESERVED,
                    postingKey: `${payoutTx}:reserved-debit`,
                    money: {
                        amount: current.withdrawal.amount,
                        currency: current.withdrawal.currency,
                    },
                    type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT,
                    source: ledgerSource_enum_1.LedgerSource.PAYOUT,
                    description: "Creator withdrawal payout completed",
                    idempotencyKey: payoutTx,
                }, session);
                await this.ledger.createCredit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: payoutTx, account: ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING, postingKey: `${payoutTx}:clearing-credit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, description: "Creator withdrawal payout cleared", idempotencyKey: payoutTx }, session);
                await this.balances.consumeReservedBalance({
                    creatorId: current.withdrawal.creatorId.toString(),
                    money: {
                        amount: current.withdrawal.amount,
                        currency: current.withdrawal.currency,
                    },
                }, session);
                await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.create({ creatorId: current.withdrawal.creatorId, withdrawalId: current.withdrawal._id, operationReference: `withdrawal:${current.withdrawal.withdrawalReference}:projection:paid`, operationType: withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType.PAYOUT_COMPLETE, amount: current.withdrawal.amount, currency: current.withdrawal.currency, sourceReference: current.withdrawal.withdrawalReference, ledgerTransactionReference: payoutTx, appliedAt: new Date() }, session);
                const payout = await this.repository.updateById(current.payout._id.toString(), {
                    status: payoutStatus_enum_1.PayoutStatus.COMPLETED,
                    completedAt: result.completedAt ?? new Date(),
                    providerPayload: result.payload ?? {},
                }, session);
                if (!payout) {
                    throw new PayoutError_1.PayoutError("Failed to complete payout.");
                }
                const withdrawal = await this.withdrawals.markCompleted(withdrawalId, session);
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_SUCCEEDED, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: payout.provider, providerReference: payout.providerPayoutId, ledgerTransactionReference: payoutTx, projectionOperationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:paid` }, transition: { fromStatus: payoutStatus_enum_1.PayoutStatus.PROCESSING, toStatus: payoutStatus_enum_1.PayoutStatus.COMPLETED, outcome: "SUCCEEDED" }, session });
                finalized = { withdrawal, payout };
            });
        }
        finally {
            await session.endSession();
        }
        if (!finalized) {
            throw new PayoutError_1.PayoutError("Failed to finalize payout completion.");
        }
        return finalized;
    }
    async finalizeFailure(withdrawalId, result) {
        const session = await mongoose_1.default.startSession();
        let finalized = null;
        try {
            await session.withTransaction(async () => {
                const current = await this.getProcessingRelationshipInSession(withdrawalId, session);
                if (current.withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { outcome: "REPLAYED" }, session });
                    finalized = current;
                    return;
                }
                const failureTx = `withdrawal:${current.withdrawal.withdrawalReference}:failure`;
                await this.ledger.createDebit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: failureTx, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${failureTx}:reserved-debit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, description: "Withdrawal payout failure release", idempotencyKey: failureTx }, session);
                await this.ledger.createCredit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: failureTx, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_AVAILABLE, postingKey: `${failureTx}:available-credit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, description: "Withdrawal payout failure release", idempotencyKey: failureTx }, session);
                await this.balances.releaseReservedBalance({
                    creatorId: current.withdrawal.creatorId.toString(),
                    money: {
                        amount: current.withdrawal.amount,
                        currency: current.withdrawal.currency,
                    },
                }, session);
                await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.create({ creatorId: current.withdrawal.creatorId, withdrawalId: current.withdrawal._id, operationReference: `withdrawal:${current.withdrawal.withdrawalReference}:projection:failure-release`, operationType: withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType.FAILURE_RELEASE, amount: current.withdrawal.amount, currency: current.withdrawal.currency, sourceReference: current.withdrawal.withdrawalReference, ledgerTransactionReference: failureTx, appliedAt: new Date() }, session);
                const payout = await this.repository.updateById(current.payout._id.toString(), {
                    status: payoutStatus_enum_1.PayoutStatus.FAILED,
                    failedAt: result.failedAt ?? new Date(),
                    failureMessage: result.failureReason,
                    providerPayload: result.payload ?? {},
                }, session);
                if (!payout) {
                    throw new PayoutError_1.PayoutError("Failed to fail payout.");
                }
                const withdrawal = await this.withdrawals.markFailed(withdrawalId, result.failureReason, session);
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_FAILED, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: payout.provider, providerReference: payout.providerPayoutId, ledgerTransactionReference: failureTx, projectionOperationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:failure-release` }, transition: { fromStatus: payoutStatus_enum_1.PayoutStatus.PROCESSING, toStatus: payoutStatus_enum_1.PayoutStatus.FAILED, outcome: "FAILED" }, session });
                finalized = { withdrawal, payout };
            });
        }
        finally {
            await session.endSession();
        }
        if (!finalized) {
            throw new PayoutError_1.PayoutError("Failed to finalize payout failure.");
        }
        return finalized;
    }
    async getProcessingRelationshipInSession(withdrawalId, session) {
        const withdrawal = await this.withdrawals.getWithdrawal(withdrawalId, session);
        if (!withdrawal.payoutId) {
            throw new PayoutError_1.PayoutError("Withdrawal payout relationship is missing.");
        }
        const payout = await this.repository.findById(withdrawal.payoutId.toString(), session);
        if (!payout ||
            payout.sourceType !== payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL ||
            !payout.withdrawalId ||
            payout.withdrawalId.toString() !== withdrawalId) {
            throw new PayoutError_1.PayoutError("Withdrawal has a conflicting payout relationship.");
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
            throw new PayoutError_1.PayoutError("Withdrawal must be processing before finalization.");
        }
        return { withdrawal, payout };
    }
    async preparePayout(withdrawalId) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const withdrawal = await this.withdrawals.getWithdrawal(withdrawalId, session);
                if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.RESERVED &&
                    withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING) {
                    throw new PayoutError_1.PayoutError("Withdrawal must be reserved before payout initialization.");
                }
                let payout = null;
                if (withdrawal.payoutId) {
                    payout = await this.repository.findById(withdrawal.payoutId.toString(), session);
                }
                else {
                    payout = await this.payouts.getByWithdrawal(withdrawalId, session);
                }
                if (!payout) {
                    payout = await this.payouts.createWithdrawalPayout({
                        withdrawalId,
                        creatorId: withdrawal.creatorId.toString(),
                        amount: {
                            amount: withdrawal.amount,
                            currency: withdrawal.currency,
                        },
                        idempotencyKey: `withdrawal-payout:${withdrawal.withdrawalReference}`,
                    }, session);
                }
                if (payout.sourceType !== payoutSourceType_enum_1.PayoutSourceType.WITHDRAWAL ||
                    !payout.withdrawalId ||
                    payout.withdrawalId.toString() !== withdrawalId ||
                    payout.creatorId.toString() !== withdrawal.creatorId.toString() ||
                    payout.amount !== withdrawal.amount ||
                    payout.currency !== withdrawal.currency) {
                    throw new PayoutError_1.PayoutError("Withdrawal has a conflicting payout relationship.");
                }
                const linkedWithdrawal = await this.withdrawals.linkPayout(withdrawalId, payout._id.toString(), session);
                result = { withdrawal: linkedWithdrawal, payout };
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new PayoutError_1.PayoutError("Failed to prepare withdrawal payout.");
        }
        return result;
    }
    async synchronizeProviderInitialization(withdrawalId, payoutId, providerResponse) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const payout = await this.repository.findById(payoutId, session);
                if (!payout) {
                    throw new PayoutError_1.PayoutError("Payout not found.");
                }
                if (payout.providerPayoutId &&
                    payout.providerPayoutId !== providerResponse.providerPayoutId) {
                    throw new PayoutError_1.PayoutError("Provider payout identifier conflicts with payout.");
                }
                const updatedPayout = await this.repository.updateById(payoutId, {
                    providerPayoutId: providerResponse.providerPayoutId,
                    providerTransferId: providerResponse.providerReference,
                    providerPayload: providerResponse.payload ?? {},
                    status: payoutStatus_enum_1.PayoutStatus.PROCESSING,
                }, session);
                if (!updatedPayout) {
                    throw new PayoutError_1.PayoutError("Failed to synchronize payout initialization.");
                }
                const withdrawal = await this.withdrawals.markProcessing(withdrawalId, payoutId, session);
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_PROCESSING_STARTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: updatedPayout._id, financialContext: { domain: "PAYOUT", primaryReference: updatedPayout.payoutReference, payoutReference: updatedPayout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: updatedPayout.provider, providerReference: updatedPayout.providerPayoutId }, transition: { fromStatus: payoutStatus_enum_1.PayoutStatus.CREATED, toStatus: payoutStatus_enum_1.PayoutStatus.PROCESSING, outcome: "PROCESSING" }, session });
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYOUT_PROVIDER_SYNCHRONIZED, actor: { type: "PROVIDER", reference: updatedPayout.provider }, entityType: "PAYOUT", entityId: updatedPayout._id, financialContext: { domain: "PAYOUT", primaryReference: updatedPayout.payoutReference, payoutReference: updatedPayout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: updatedPayout.provider, providerReference: updatedPayout.providerPayoutId }, transition: { toStatus: payoutStatus_enum_1.PayoutStatus.PROCESSING, outcome: "PROCESSING" }, session });
                result = { withdrawal, payout: updatedPayout };
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new PayoutError_1.PayoutError("Failed to synchronize withdrawal payout.");
        }
        return result;
    }
}
exports.WithdrawalPayoutLifecycleService = WithdrawalPayoutLifecycleService;
exports.withdrawalPayoutLifecycleService = new WithdrawalPayoutLifecycleService();
