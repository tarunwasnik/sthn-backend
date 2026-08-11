"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalService = exports.WithdrawalService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const withdrawal_repository_1 = require("../../repositories/withdrawal.repository");
const money_util_1 = require("../../utils/financial/money.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const WithdrawalError_1 = require("../../errors/financial/WithdrawalError");
const withdrawalStatus_enum_1 = require("../../enums/financial/withdrawalStatus.enum");
const creatorBalance_service_1 = require("./creatorBalance.service");
const payoutDestination_service_1 = require("./payoutDestination.service");
const ledger_service_1 = require("./ledger.service");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const withdrawalCreatorBalanceProjectionOperation_repository_1 = require("../../repositories/withdrawalCreatorBalanceProjectionOperation.repository");
const withdrawalProjectionOperationType_enum_1 = require("../../enums/financial/withdrawalProjectionOperationType.enum");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const withdrawalEligibility_service_1 = require("./withdrawalEligibility.service");
class WithdrawalService {
    constructor(repository = withdrawal_repository_1.withdrawalRepository, balances = creatorBalance_service_1.creatorBalanceService) {
        this.repository = repository;
        this.balances = balances;
    }
    validateInput(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.creatorId)) {
            throw new WithdrawalError_1.WithdrawalError("Invalid creator id.");
        }
        if (!(0, money_util_1.isValidMoney)(input.amount)) {
            throw new WithdrawalError_1.WithdrawalError("Invalid withdrawal amount.");
        }
        if (!(0, idempotency_util_1.isValidIdempotencyKey)(input.idempotencyKey)) {
            throw new WithdrawalError_1.WithdrawalError("Invalid idempotency key.");
        }
        if (typeof input.destinationReference !== "string" || !input.destinationReference.trim()) {
            throw new WithdrawalError_1.WithdrawalError("Invalid payout destination reference.");
        }
    }
    ensureSameRequest(withdrawal, input) {
        if (withdrawal.creatorId.toString() !== input.creatorId ||
            withdrawal.amount !== input.amount.amount ||
            withdrawal.currency !== input.amount.currency
            || !withdrawal.destinationSnapshot
            || withdrawal.destinationSnapshot.destinationReference !== input.destinationReference) {
            throw new WithdrawalError_1.WithdrawalError("Idempotency key conflicts with an existing withdrawal request.", "WITHDRAWAL_IDEMPOTENCY_CONFLICT");
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.RESERVED &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED &&
            withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
            throw new WithdrawalError_1.WithdrawalError("Existing withdrawal is not in the reserved state.", "WITHDRAWAL_INVALID_STATE");
        }
    }
    async requestWithdrawal(input) {
        this.validateInput(input);
        const idempotencyKey = (0, idempotency_util_1.normalizeIdempotencyKey)(input.idempotencyKey);
        const normalizedInput = { ...input, idempotencyKey };
        const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
        if (existing) {
            this.ensureSameRequest(existing, normalizedInput);
            return existing;
        }
        const eligibility = await withdrawalEligibility_service_1.withdrawalEligibilityService.evaluate({
            creatorId: input.creatorId,
            amount: input.amount,
            destinationReference: input.destinationReference,
        });
        if (!eligibility.allowed) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal is not currently eligible.", `WITHDRAWAL_ELIGIBILITY_${eligibility.reason}`);
        }
        const active = await this.repository.findActiveByCreator(input.creatorId);
        if (active)
            throw new WithdrawalError_1.WithdrawalError("Creator already has an active withdrawal.", "ACTIVE_WITHDRAWAL_ALREADY_EXISTS");
        const session = await mongoose_1.default.startSession();
        let reservedWithdrawal = null;
        try {
            await session.withTransaction(async () => {
                const existingInTransaction = await this.repository.findByIdempotencyKey(idempotencyKey, session);
                if (existingInTransaction) {
                    this.ensureSameRequest(existingInTransaction, normalizedInput);
                    reservedWithdrawal = existingInTransaction;
                    return;
                }
                const activeInTransaction = await this.repository.findActiveByCreator(input.creatorId, session);
                if (activeInTransaction)
                    throw new WithdrawalError_1.WithdrawalError("Creator already has an active withdrawal.", "ACTIVE_WITHDRAWAL_ALREADY_EXISTS");
                const withdrawalReference = (0, reference_util_1.generateFinancialReference)("WITHDRAWAL");
                const binding = await payoutDestination_service_1.payoutDestinationService.createWithdrawalBindingSnapshot({
                    creatorId: input.creatorId,
                    destinationReference: input.destinationReference,
                    withdrawalReference,
                    session,
                });
                const withdrawal = await this.repository.create({
                    withdrawalReference,
                    creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
                    amount: input.amount.amount,
                    currency: input.amount.currency,
                    status: withdrawalStatus_enum_1.WithdrawalStatus.REQUESTED,
                    idempotencyKey,
                    payoutDestinationId: binding.payoutDestinationId,
                    destinationSnapshot: binding.snapshot,
                    requestedAt: new Date(),
                    attributes: input.attributes ?? {},
                    isActiveObligation: true,
                }, session);
                await this.balances.reserveAvailableBalance({
                    creatorId: input.creatorId,
                    money: input.amount,
                }, session);
                const reserveTx = `withdrawal:${withdrawalReference}:reserve`;
                await ledger_service_1.ledgerService.createDebit({ type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_AVAILABLE, postingKey: `${reserveTx}:available-debit`, transactionId: reserveTx, userId: input.creatorId, money: input.amount, description: "Creator withdrawal reservation" }, session);
                await ledger_service_1.ledgerService.createCredit({ type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${reserveTx}:reserved-credit`, transactionId: reserveTx, userId: input.creatorId, money: input.amount, description: "Creator withdrawal reservation" }, session);
                await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.create({ creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId), withdrawalId: withdrawal._id, operationReference: `withdrawal:${withdrawalReference}:projection:reserve`, operationType: withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType.RESERVE, amount: input.amount.amount, currency: input.amount.currency, sourceReference: withdrawalReference, ledgerTransactionReference: reserveTx, appliedAt: new Date() }, session);
                const reserved = await this.repository.updateById(withdrawal._id.toString(), {
                    status: withdrawalStatus_enum_1.WithdrawalStatus.RESERVED,
                    reservedAt: new Date(),
                }, session);
                if (!reserved) {
                    throw new WithdrawalError_1.WithdrawalError("Failed to reserve withdrawal.");
                }
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.WITHDRAWAL_FUNDS_RESERVED, actor: { type: "CREATOR", id: new mongoose_1.default.Types.ObjectId(input.creatorId) }, entityType: "WITHDRAWAL", entityId: reserved._id, financialContext: { domain: "WITHDRAWAL", primaryReference: reserved.withdrawalReference, withdrawalReference: reserved.withdrawalReference, amount: reserved.amount, currency: reserved.currency, ledgerTransactionReference: reserveTx, projectionOperationReference: `withdrawal:${withdrawalReference}:projection:reserve` }, transition: { fromStatus: withdrawalStatus_enum_1.WithdrawalStatus.REQUESTED, toStatus: withdrawalStatus_enum_1.WithdrawalStatus.RESERVED, outcome: "SUCCEEDED" }, session });
                reservedWithdrawal = reserved;
            });
            if (!reservedWithdrawal) {
                throw new WithdrawalError_1.WithdrawalError("Failed to reserve withdrawal.");
            }
            return reservedWithdrawal;
        }
        catch (error) {
            if (typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === 11000) {
                const concurrent = await this.repository.findByIdempotencyKey(idempotencyKey);
                if (concurrent) {
                    this.ensureSameRequest(concurrent, normalizedInput);
                    return concurrent;
                }
            }
            throw error;
        }
        finally {
            await session.endSession();
        }
    }
    async getWithdrawal(withdrawalId, session) {
        if (!mongoose_1.default.Types.ObjectId.isValid(withdrawalId)) {
            throw new WithdrawalError_1.WithdrawalError("Invalid withdrawal id.");
        }
        const withdrawal = await this.repository.findById(withdrawalId, session);
        if (!withdrawal) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal not found.");
        }
        return withdrawal;
    }
    async cancelWithdrawal(withdrawalId, creatorId, reason) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const withdrawal = await this.getWithdrawal(withdrawalId, session);
                if (withdrawal.creatorId.toString() !== creatorId)
                    throw new WithdrawalError_1.WithdrawalError("Withdrawal is not owned by this creator.", "WITHDRAWAL_NOT_OWNED");
                if (withdrawal.cancelledAt) {
                    result = withdrawal;
                    return;
                }
                if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.RESERVED)
                    throw new WithdrawalError_1.WithdrawalError("Withdrawal cannot be cancelled after payout processing begins.", "WITHDRAWAL_NOT_CANCELLABLE");
                const tx = `withdrawal:${withdrawal.withdrawalReference}:cancel`;
                await ledger_service_1.ledgerService.createDebit({ type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${tx}:reserved-debit`, transactionId: tx, userId: creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency }, description: "Withdrawal cancellation release" }, session);
                await ledger_service_1.ledgerService.createCredit({ type: ledgerEntryType_enum_1.LedgerEntryType.PAYOUT, source: ledgerSource_enum_1.LedgerSource.PAYOUT, account: ledgerAccount_enum_1.LedgerAccount.CREATOR_AVAILABLE, postingKey: `${tx}:available-credit`, transactionId: tx, userId: creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency }, description: "Withdrawal cancellation release" }, session);
                await this.balances.releaseReservedBalance({ creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency } }, session);
                await withdrawalCreatorBalanceProjectionOperation_repository_1.withdrawalCreatorBalanceProjectionOperationRepository.create({ creatorId: new mongoose_1.default.Types.ObjectId(creatorId), withdrawalId: withdrawal._id, operationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:cancel-release`, operationType: withdrawalProjectionOperationType_enum_1.WithdrawalProjectionOperationType.CANCEL_RELEASE, amount: withdrawal.amount, currency: withdrawal.currency, sourceReference: withdrawal.withdrawalReference, ledgerTransactionReference: tx, appliedAt: new Date() }, session);
                const updated = await this.repository.updateById(withdrawalId, { status: withdrawalStatus_enum_1.WithdrawalStatus.CANCELLED, isActiveObligation: false, cancelledAt: new Date(), cancelledBy: new mongoose_1.default.Types.ObjectId(creatorId), cancellationReason: reason?.trim() }, session);
                if (!updated)
                    throw new WithdrawalError_1.WithdrawalError("Withdrawal cancellation conflicted.");
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.WITHDRAWAL_CANCELLED, actor: { type: "CREATOR", id: new mongoose_1.default.Types.ObjectId(creatorId) }, entityType: "WITHDRAWAL", entityId: updated._id, financialContext: { domain: "WITHDRAWAL", primaryReference: updated.withdrawalReference, withdrawalReference: updated.withdrawalReference, amount: updated.amount, currency: updated.currency, ledgerTransactionReference: tx, projectionOperationReference: `withdrawal:${updated.withdrawalReference}:projection:cancel-release` }, transition: { fromStatus: withdrawalStatus_enum_1.WithdrawalStatus.RESERVED, toStatus: withdrawalStatus_enum_1.WithdrawalStatus.CANCELLED, outcome: "SUCCEEDED" }, session });
                result = updated;
            });
        }
        finally {
            await session.endSession();
        }
        if (!result)
            throw new WithdrawalError_1.WithdrawalError("Withdrawal cancellation failed.");
        return result;
    }
    async markProcessing(withdrawalId, payoutId, session) {
        const withdrawal = await this.getWithdrawal(withdrawalId, session);
        if (withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING) {
            if (!withdrawal.payoutId || withdrawal.payoutId.toString() !== payoutId) {
                throw new WithdrawalError_1.WithdrawalError("Processing withdrawal has a conflicting payout relationship.", "WITHDRAWAL_PAYOUT_CONFLICT");
            }
            return withdrawal;
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.RESERVED) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal must be reserved before payout initialization.", "WITHDRAWAL_INVALID_STATE");
        }
        const updated = await this.repository.updateById(withdrawalId, {
            payoutId: new mongoose_1.default.Types.ObjectId(payoutId),
            status: withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING,
            processingAt: new Date(),
        }, session);
        if (!updated) {
            throw new WithdrawalError_1.WithdrawalError("Failed to mark withdrawal as processing.");
        }
        return updated;
    }
    async linkPayout(withdrawalId, payoutId, session) {
        const withdrawal = await this.getWithdrawal(withdrawalId, session);
        if (withdrawal.payoutId &&
            withdrawal.payoutId.toString() !== payoutId) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal has a conflicting payout relationship.", "WITHDRAWAL_PAYOUT_CONFLICT");
        }
        if (withdrawal.payoutId) {
            return withdrawal;
        }
        const updated = await this.repository.updateById(withdrawalId, { payoutId: new mongoose_1.default.Types.ObjectId(payoutId) }, session);
        if (!updated) {
            throw new WithdrawalError_1.WithdrawalError("Failed to link withdrawal payout.");
        }
        return updated;
    }
    async markCompleted(withdrawalId, session) {
        const withdrawal = await this.getWithdrawal(withdrawalId, session);
        if (withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED) {
            return withdrawal;
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal must be processing before completion.");
        }
        const updated = await this.repository.updateById(withdrawalId, { status: withdrawalStatus_enum_1.WithdrawalStatus.COMPLETED, completedAt: new Date(), isActiveObligation: false }, session);
        if (!updated) {
            throw new WithdrawalError_1.WithdrawalError("Failed to complete withdrawal.");
        }
        return updated;
    }
    async markFailed(withdrawalId, failureReason, session) {
        const withdrawal = await this.getWithdrawal(withdrawalId, session);
        if (withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.FAILED) {
            return withdrawal;
        }
        if (withdrawal.status !== withdrawalStatus_enum_1.WithdrawalStatus.PROCESSING) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal must be processing before failure.");
        }
        const updated = await this.repository.updateById(withdrawalId, {
            status: withdrawalStatus_enum_1.WithdrawalStatus.FAILED,
            failedAt: new Date(),
            failureReason,
            isActiveObligation: false,
        }, session);
        if (!updated) {
            throw new WithdrawalError_1.WithdrawalError("Failed to fail withdrawal.");
        }
        return updated;
    }
}
exports.WithdrawalService = WithdrawalService;
exports.withdrawalService = new WithdrawalService();
