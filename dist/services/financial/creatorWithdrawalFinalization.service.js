"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalFinalizationService = exports.CreatorWithdrawalFinalizationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalFinalizationOutcome_enum_1 = require("../../enums/financial/creatorWithdrawalFinalizationOutcome.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const CreatorWithdrawalFinalizationError_1 = require("../../errors/financial/CreatorWithdrawalFinalizationError");
const LedgerError_1 = require("../../errors/financial/LedgerError");
const WalletError_1 = require("../../errors/financial/WalletError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const internalWithdrawalProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWithdrawalProviderRequest.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const creatorWithdrawalFinalizationIdentity_util_1 = require("../../utils/financial/creatorWithdrawalFinalizationIdentity.util");
const creatorWithdrawalRequestIdentity_util_1 = require("../../utils/financial/creatorWithdrawalRequestIdentity.util");
const withdrawalProviderIdentity_util_1 = require("../../utils/financial/withdrawalProviderIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const ledger_service_1 = require("./ledger.service");
const withdrawalProviderExecution_service_1 = require("./withdrawalProviderExecution.service");
const isTransientTransactionError = (error) => {
    const candidate = error;
    return candidate?.code === 112 ||
        candidate?.code === 251 ||
        candidate?.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};
class CreatorWithdrawalFinalizationService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    fail(message, code, cause) {
        throw new CreatorWithdrawalFinalizationError_1.CreatorWithdrawalFinalizationError(message, code, { cause });
    }
    outcomeForProvider(providerStatus) {
        if (providerStatus ===
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED) {
            return creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED;
        }
        if (providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED) {
            return creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED;
        }
        this.fail("Provider request has no terminal finalization outcome.", "CREATOR_WITHDRAWAL_FINALIZATION_INVALID_PROVIDER_STATUS");
    }
    ensureProviderIdentity(withdrawal, provider) {
        if (!provider.executionReference ||
            !provider.executionFingerprint ||
            !provider.terminalResult ||
            !provider.isTerminal) {
            this.fail("Provider execution authority is incomplete.", "CREATOR_WITHDRAWAL_FINALIZATION_PROVIDER_IDENTITY_CONFLICT");
        }
        const providerIdentity = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderIdentity)({
            withdrawalReference: withdrawal.withdrawalReference,
            creatorId: withdrawal.creatorId,
            creatorReference: provider.creatorReference,
            walletId: withdrawal.walletId,
            destinationReference: withdrawal.destinationReference,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
        });
        const executionIdentity = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderExecutionIdentity)({
            providerRequestReference: provider.providerRequestReference,
            providerRequestKey: provider.providerRequestKey,
            providerReference: provider.providerReference,
            providerFingerprint: provider.providerFingerprint,
        });
        if (withdrawal.providerRequestReference !==
            provider.providerRequestReference ||
            provider.providerRequestReference !==
                providerIdentity.providerRequestReference ||
            provider.providerRequestKey !== providerIdentity.providerRequestKey ||
            provider.providerReference !== providerIdentity.providerReference ||
            provider.providerFingerprint !== providerIdentity.providerFingerprint ||
            provider.executionReference !== executionIdentity.executionReference ||
            provider.executionFingerprint !==
                executionIdentity.executionFingerprint ||
            provider.terminalResult.outcome !== provider.providerStatus ||
            withdrawal.providerTerminalStatus !== provider.providerStatus) {
            this.fail("Provider identity conflicts with the withdrawal authority.", "CREATOR_WITHDRAWAL_FINALIZATION_PROVIDER_IDENTITY_CONFLICT");
        }
        if (provider.amount !== withdrawal.amount ||
            provider.currency !== withdrawal.currency) {
            this.fail("Provider amount or currency conflicts with withdrawal authority.", provider.amount !== withdrawal.amount
                ? "CREATOR_WITHDRAWAL_FINALIZATION_AMOUNT_CONFLICT"
                : "CREATOR_WITHDRAWAL_FINALIZATION_CURRENCY_CONFLICT");
        }
        if (provider.destinationReference !== withdrawal.destinationReference) {
            this.fail("Provider destination conflicts with withdrawal authority.", "CREATOR_WITHDRAWAL_FINALIZATION_DESTINATION_CONFLICT");
        }
    }
    identity(withdrawal, provider, outcome) {
        if (!withdrawal.ledgerTransactionReference ||
            !provider.executionReference ||
            !provider.executionFingerprint) {
            this.fail("Finalization identity inputs are incomplete.", "CREATOR_WITHDRAWAL_FINALIZATION_INTEGRITY_ERROR");
        }
        return (0, creatorWithdrawalFinalizationIdentity_util_1.deriveCreatorWithdrawalFinalizationIdentity)({
            withdrawalReference: withdrawal.withdrawalReference,
            withdrawalKey: withdrawal.withdrawalKey,
            creatorId: withdrawal.creatorId,
            creatorUserId: withdrawal.creatorUserId,
            walletId: withdrawal.walletId,
            destinationId: withdrawal.destinationId,
            destinationReference: withdrawal.destinationReference,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            providerRequestReference: provider.providerRequestReference,
            providerRequestKey: provider.providerRequestKey,
            providerFingerprint: provider.providerFingerprint,
            providerReference: provider.providerReference,
            providerExecutionReference: provider.executionReference,
            providerExecutionFingerprint: provider.executionFingerprint,
            providerTerminalStatus: provider.providerStatus,
            reservationTransactionId: withdrawal.ledgerTransactionReference,
            outcome,
        });
    }
    async validateReservationGraph(withdrawal, session) {
        if (!withdrawal.ledgerTransactionReference ||
            !withdrawal.projectionReference ||
            withdrawal.ledgerEntryIds.length !== 2) {
            this.fail("Original reservation authority is incomplete.", "CREATOR_WITHDRAWAL_FINALIZATION_RESERVATION_LEDGER_CONFLICT");
        }
        const authorityFingerprint = (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalAuthorityFingerprint)({
            withdrawalReference: withdrawal.withdrawalReference,
            creatorId: withdrawal.creatorId,
            creatorUserId: withdrawal.creatorUserId,
            walletId: withdrawal.walletId,
            destinationId: withdrawal.destinationId,
            destinationReference: withdrawal.destinationReference,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
        });
        if (withdrawal.requestFingerprint !== authorityFingerprint) {
            this.fail("Withdrawal reservation identity conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_RESERVATION_LEDGER_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: withdrawal.ledgerTransactionReference,
        }, session);
        const expectedIds = new Set(withdrawal.ledgerEntryIds.map(String));
        const commonValid = entries.length === 2 && entries.every((entry) => expectedIds.has(entry._id.toString()) &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED &&
            entry.source === ledgerSource_enum_1.LedgerSource.CREATOR_WITHDRAWAL_RESERVATION &&
            entry.userId?.equals(withdrawal.creatorUserId) &&
            entry.walletId?.equals(withdrawal.walletId) &&
            entry.amount === withdrawal.amount &&
            entry.currency === withdrawal.currency &&
            entry.metadata?.withdrawalReference ===
                withdrawal.withdrawalReference &&
            entry.metadata?.destinationReference ===
                withdrawal.destinationReference);
        const debit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.postingKey ===
                `${withdrawal.ledgerTransactionReference}:wallet-available-debit`);
        const credit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED &&
            entry.postingKey ===
                `${withdrawal.ledgerTransactionReference}:withdrawal-reserved-credit`);
        if (!commonValid || !debit || !credit) {
            this.fail("Original reservation Ledger conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_RESERVATION_LEDGER_CONFLICT");
        }
        const operationKey = `${withdrawal.ledgerTransactionReference}:wallet-projection`;
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(operationKey, session);
        const projectionFingerprint = (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalProjectionFingerprint)({
            creatorUserId: withdrawal.creatorUserId,
            currency: withdrawal.currency,
            operationKey,
            amount: withdrawal.amount,
            ledgerEntryIds: withdrawal.ledgerEntryIds,
        });
        if (!projection ||
            projection.operationReference !== withdrawal.projectionReference ||
            projection.fingerprint !== projectionFingerprint ||
            !projection.walletId.equals(withdrawal.walletId) ||
            !projection.userId.equals(withdrawal.creatorUserId) ||
            projection.currency !== withdrawal.currency ||
            projection.deltas.availableBalance !== -withdrawal.amount ||
            projection.deltas.reservedBalance !== withdrawal.amount ||
            projection.deltas.lockedBalance !== 0 ||
            projection.ledgerEntryIds.length !== 2 ||
            !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString()))) {
            this.fail("Original reservation Wallet projection conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_RESERVATION_PROJECTION_CONFLICT");
        }
    }
    async validateReservationAuthority(withdrawalReference) {
        const withdrawal = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference);
        if (!withdrawal) {
            this.fail("Creator withdrawal request was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_WITHDRAWAL_NOT_FOUND");
        }
        await this.validateReservationGraph(withdrawal);
        return true;
    }
    async loadGraph(withdrawalReference, session) {
        const withdrawal = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference, session);
        if (!withdrawal) {
            this.fail("Creator withdrawal request was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_WITHDRAWAL_NOT_FOUND");
        }
        const provider = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(withdrawalReference, session);
        if (!provider) {
            this.fail("Withdrawal provider request was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_PROVIDER_NOT_FOUND");
        }
        this.ensureProviderIdentity(withdrawal, provider);
        const outcome = this.outcomeForProvider(provider.providerStatus);
        const wallet = await wallet_repository_1.walletRepository.findById(withdrawal.walletId, session);
        if (!wallet) {
            this.fail("Creator Wallet was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_WALLET_NOT_FOUND");
        }
        if (!wallet.userId.equals(withdrawal.creatorUserId)) {
            this.fail("Creator Wallet ownership conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_WALLET_OWNERSHIP_CONFLICT");
        }
        if (wallet.currency !== withdrawal.currency) {
            this.fail("Creator Wallet currency conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_CURRENCY_CONFLICT");
        }
        if (wallet.currentBalance !==
            wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
            this.fail("Creator Wallet integrity failed.", "CREATOR_WITHDRAWAL_FINALIZATION_INTEGRITY_ERROR");
        }
        return {
            withdrawal,
            provider,
            wallet,
            outcome,
            identity: this.identity(withdrawal, provider, outcome),
        };
    }
    safe(graph, replay) {
        const { withdrawal, provider, wallet } = graph;
        return {
            withdrawalReference: withdrawal.withdrawalReference,
            status: withdrawal.status,
            providerRequestReference: provider.providerRequestReference,
            providerTerminalStatus: provider.providerStatus,
            finalizationReference: withdrawal.finalizationReference,
            outcome: withdrawal.finalizationOutcome,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            completedAt: withdrawal.completedAt,
            failedAt: withdrawal.failedAt,
            wallet: {
                currency: wallet.currency,
                currentBalance: wallet.currentBalance,
                availableBalance: wallet.availableBalance,
                reservedBalance: wallet.reservedBalance,
                lockedBalance: wallet.lockedBalance,
            },
            replay,
        };
    }
    async assertNoOppositeGraph(graph, session) {
        const oppositeOutcome = graph.outcome ===
            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED
            : creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED;
        const opposite = this.identity(graph.withdrawal, graph.provider, oppositeOutcome);
        const oppositeAction = oppositeOutcome ===
            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED
            : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED;
        const [entries, projection, auditCount] = await Promise.all([
            ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                transactionId: opposite.finalizationTransactionId,
            }, session),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(opposite.projectionOperationKey, session),
            auditLog_model_1.AuditLog.countDocuments({
                action: oppositeAction,
                "financialContext.withdrawalReference": graph.withdrawal.withdrawalReference,
            }).session(session ?? null),
        ]);
        if (entries.length || projection || auditCount) {
            this.fail("Opposite withdrawal finalization graph exists.", "CREATOR_WITHDRAWAL_FINALIZATION_OUTCOME_CONFLICT");
        }
    }
    async validateProviderGraph(withdrawalReference) {
        try {
            await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.validateReplay(withdrawalReference);
        }
        catch (error) {
            this.fail("Withdrawal provider execution graph conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_PROVIDER_IDENTITY_CONFLICT", error);
        }
    }
    async validateReplay(withdrawalReference) {
        const graph = await this.loadGraph(withdrawalReference);
        const { withdrawal, provider, wallet, outcome, identity } = graph;
        await this.validateReservationGraph(withdrawal);
        await this.validateProviderGraph(withdrawalReference);
        if (String(withdrawal.status) !== outcome ||
            withdrawal.reservedAmount !== 0 ||
            withdrawal.isActiveObligation ||
            withdrawal.finalizationOutcome !== outcome ||
            withdrawal.finalizationReference !== identity.finalizationReference ||
            withdrawal.finalizationKey !== identity.finalizationKey ||
            withdrawal.finalizationTransactionId !==
                identity.finalizationTransactionId ||
            withdrawal.finalizationProjectionOperationReference !==
                identity.projectionReference ||
            withdrawal.finalizationFingerprint !==
                identity.finalizationFingerprint ||
            withdrawal.providerTerminalReference !== provider.executionReference ||
            withdrawal.finalizationLedgerEntryIds.length !== 2 ||
            !withdrawal.finalizationProjectionOperationId ||
            (outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                ? !withdrawal.completedAt || withdrawal.failedAt !== undefined
                : !withdrawal.failedAt || withdrawal.completedAt !== undefined)) {
            this.fail("Withdrawal terminal metadata conflicts with finalization identity.", "CREATOR_WITHDRAWAL_FINALIZATION_REPLAY_CONFLICT");
        }
        if ((outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED &&
            provider.providerStatus !==
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED) ||
            (outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED &&
                provider.providerStatus !==
                    internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED)) {
            this.fail("Provider terminal outcome conflicts with withdrawal finalization.", "CREATOR_WITHDRAWAL_FINALIZATION_OUTCOME_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.finalizationTransactionId,
        });
        const expectedIds = new Set(withdrawal.finalizationLedgerEntryIds.map(String));
        const type = outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED
            : ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED;
        const commonValid = entries.length === 2 && entries.every((entry) => expectedIds.has(entry._id.toString()) &&
            entry.type === type &&
            entry.source === ledgerSource_enum_1.LedgerSource.WITHDRAWAL_PROVIDER_FINALIZATION &&
            entry.userId?.equals(withdrawal.creatorUserId) &&
            entry.amount === withdrawal.amount &&
            entry.currency === withdrawal.currency &&
            entry.metadata?.withdrawalReference === withdrawal.withdrawalReference &&
            entry.metadata?.finalizationReference ===
                identity.finalizationReference);
        const debit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED &&
            entry.walletId?.equals(withdrawal.walletId) &&
            entry.postingKey === identity.reservedDebitPostingKey);
        const credit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.account === (outcome ===
                creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                ? ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING
                : ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE) &&
            (outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                ? !entry.walletId
                : entry.walletId?.equals(withdrawal.walletId)) &&
            entry.postingKey === identity.terminalCreditPostingKey);
        if (!commonValid || !debit || !credit) {
            this.fail("Finalization Ledger graph conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_LEDGER_CONFLICT");
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey);
        const expectedAvailable = outcome ===
            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? 0
            : withdrawal.amount;
        if (!projection ||
            !projection._id.equals(withdrawal.finalizationProjectionOperationId) ||
            projection.operationReference !== identity.projectionReference ||
            !projection.walletId.equals(withdrawal.walletId) ||
            !projection.userId.equals(withdrawal.creatorUserId) ||
            projection.currency !== withdrawal.currency ||
            projection.deltas.availableBalance !== expectedAvailable ||
            projection.deltas.reservedBalance !== -withdrawal.amount ||
            projection.deltas.lockedBalance !== 0 ||
            projection.ledgerEntryIds.length !== 2 ||
            !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString()))) {
            this.fail("Finalization Wallet projection conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_PROJECTION_CONFLICT");
        }
        if (!wallet.userId.equals(withdrawal.creatorUserId) ||
            wallet.currency !== withdrawal.currency ||
            wallet.currentBalance !==
                wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance ||
            wallet.projectionVersion < projection.projectionVersion) {
            this.fail("Finalized Wallet integrity conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_INTEGRITY_ERROR");
        }
        const action = outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED
            : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED;
        const audits = await auditLog_model_1.AuditLog.find({
            action,
            entityId: withdrawal._id,
            "financialContext.withdrawalReference": withdrawalReference,
            "financialContext.ledgerTransactionReference": identity.finalizationTransactionId,
        });
        if (audits.length !== 1 ||
            audits[0].financialContext?.providerReference !==
                provider.providerReference ||
            audits[0].financialContext?.projectionOperationReference !==
                identity.projectionReference ||
            audits[0].metadata?.finalizationReference !==
                identity.finalizationReference ||
            audits[0].metadata?.finalizationOutcome !== outcome) {
            this.fail("Finalization audit conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_REPLAY_CONFLICT");
        }
        await this.assertNoOppositeGraph(graph);
        return this.safe(graph, true);
    }
    async finalizeTransaction(withdrawalReference) {
        const session = await mongoose_1.default.startSession();
        let committed = false;
        try {
            await session.withTransaction(async () => {
                let graph = await this.loadGraph(withdrawalReference, session);
                const { provider, wallet, outcome, identity } = graph;
                let withdrawal = graph.withdrawal;
                if (withdrawal.status !== creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED) {
                    this.fail("Only RESERVED withdrawals may enter finalization.", "CREATOR_WITHDRAWAL_FINALIZATION_INVALID_WITHDRAWAL_STATUS");
                }
                if (withdrawal.reservedAmount !== withdrawal.amount) {
                    this.fail("Withdrawal reservation amount conflicts.", "CREATOR_WITHDRAWAL_FINALIZATION_AMOUNT_CONFLICT");
                }
                if (wallet.reservedBalance < withdrawal.amount) {
                    this.fail("Creator Wallet reserved balance is insufficient.", "CREATOR_WITHDRAWAL_FINALIZATION_INSUFFICIENT_RESERVED_BALANCE");
                }
                await this.validateReservationGraph(withdrawal, session);
                await this.assertNoOppositeGraph(graph, session);
                const [existingEntries, existingProjection] = await Promise.all([
                    ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                        transactionId: identity.finalizationTransactionId,
                    }, session),
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session),
                ]);
                if (existingEntries.length || existingProjection) {
                    this.fail("Partial finalization transaction already exists.", "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT");
                }
                withdrawal =
                    await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.claimFinalizationIdentity({
                        requestId: withdrawal._id,
                        withdrawalReference: withdrawal.withdrawalReference,
                        providerRequestReference: provider.providerRequestReference,
                        providerTerminalStatus: provider.providerStatus,
                        finalizationOutcome: outcome,
                        finalizationReference: identity.finalizationReference,
                        finalizationKey: identity.finalizationKey,
                        finalizationTransactionId: identity.finalizationTransactionId,
                        finalizationProjectionOperationReference: identity.projectionReference,
                        finalizationFingerprint: identity.finalizationFingerprint,
                        providerTerminalReference: provider.executionReference,
                        providerFailureCode: outcome ===
                            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED
                            ? provider.terminalResult?.code
                            : undefined,
                        expectedVersion: withdrawal.version,
                    }, session) ?? this.fail("Finalization identity claim conflicted.", "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT");
                await this.onStage("AFTER_FINALIZATION_IDENTITY");
                const type = outcome ===
                    creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                    ? ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED
                    : ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED;
                const common = {
                    type,
                    source: ledgerSource_enum_1.LedgerSource.WITHDRAWAL_PROVIDER_FINALIZATION,
                    money: { amount: withdrawal.amount, currency: withdrawal.currency },
                    transactionId: identity.finalizationTransactionId,
                    userId: withdrawal.creatorUserId.toString(),
                    idempotencyKey: identity.finalizationTransactionId,
                    metadata: {
                        withdrawalReference: withdrawal.withdrawalReference,
                        destinationReference: withdrawal.destinationReference,
                        providerRequestReference: provider.providerRequestReference,
                        providerExecutionReference: provider.executionReference,
                        finalizationReference: identity.finalizationReference,
                        finalizationOutcome: outcome,
                    },
                };
                let debit;
                let credit;
                try {
                    debit = await ledger_service_1.ledgerService.createDebit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED,
                        walletId: withdrawal.walletId.toString(),
                        postingKey: identity.reservedDebitPostingKey,
                        description: "Creator withdrawal reserved funds finalized",
                    }, session);
                    await this.onStage("AFTER_FIRST_LEDGER_ENTRY");
                    credit = await ledger_service_1.ledgerService.createCredit({
                        ...common,
                        account: outcome ===
                            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                            ? ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING
                            : ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
                        ...(outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED
                            ? { walletId: withdrawal.walletId.toString() }
                            : {}),
                        postingKey: identity.terminalCreditPostingKey,
                        description: outcome ===
                            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                            ? "Creator withdrawal provider outflow finalized"
                            : "Failed Creator withdrawal reservation released",
                    }, session);
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    this.fail("Withdrawal finalization Ledger posting failed.", "CREATOR_WITHDRAWAL_FINALIZATION_LEDGER_CONFLICT", error);
                }
                await this.onStage("AFTER_BOTH_LEDGER_ENTRIES");
                await this.onStage("DURING_WALLET_PROJECTION");
                const ledgerEntryIds = [
                    debit._id,
                    credit._id,
                ];
                try {
                    await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                        userId: withdrawal.creatorUserId,
                        currency: withdrawal.currency,
                        operationKey: identity.projectionOperationKey,
                        deltas: {
                            availableBalance: outcome ===
                                creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                                ? 0
                                : withdrawal.amount,
                            reservedBalance: -withdrawal.amount,
                            lockedBalance: 0,
                        },
                        minimums: { reservedBalance: withdrawal.amount },
                        ledgerEntryIds,
                    }, session);
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    if (error instanceof WalletError_1.WalletError &&
                        error.code === "WALLET_INSUFFICIENT_BALANCE") {
                        this.fail("Creator Wallet reserved balance is insufficient.", "CREATOR_WITHDRAWAL_FINALIZATION_INSUFFICIENT_RESERVED_BALANCE", error);
                    }
                    this.fail("Withdrawal finalization Wallet projection failed.", "CREATOR_WITHDRAWAL_FINALIZATION_PROJECTION_CONFLICT", error);
                }
                await this.onStage("AFTER_WALLET_PROJECTION");
                const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
                if (!projection ||
                    projection.operationReference !== identity.projectionReference) {
                    this.fail("Finalization projection authority is missing.", "CREATOR_WITHDRAWAL_FINALIZATION_PROJECTION_CONFLICT");
                }
                await this.onStage("BEFORE_WITHDRAWAL_TERMINAL_GUARD");
                const terminalAt = new Date();
                withdrawal =
                    await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.finalizeClaimed({
                        requestId: withdrawal._id,
                        withdrawalReference: withdrawal.withdrawalReference,
                        finalizationKey: identity.finalizationKey,
                        finalizationFingerprint: identity.finalizationFingerprint,
                        finalizationOutcome: outcome,
                        finalizationLedgerEntryIds: ledgerEntryIds,
                        finalizationProjectionOperationId: projection._id,
                        finalizationProjectionOperationReference: identity.projectionReference,
                        terminalAt,
                        expectedVersion: withdrawal.version,
                    }, session) ?? this.fail("Withdrawal terminal guard conflicted.", "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT");
                await this.onStage("BEFORE_AUDIT");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: outcome ===
                        creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                        ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED
                        : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED,
                    actor: {
                        type: "SYSTEM",
                        reference: "CREATOR_WITHDRAWAL_FINALIZATION",
                    },
                    entityType: "CREATOR_WITHDRAWAL_REQUEST",
                    entityId: withdrawal._id,
                    financialContext: {
                        domain: "WITHDRAWAL",
                        primaryReference: withdrawal.withdrawalReference,
                        withdrawalReference: withdrawal.withdrawalReference,
                        provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                        providerReference: provider.providerReference,
                        amount: withdrawal.amount,
                        currency: withdrawal.currency,
                        ledgerTransactionReference: identity.finalizationTransactionId,
                        projectionOperationReference: identity.projectionReference,
                    },
                    transition: {
                        fromStatus: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
                        toStatus: outcome,
                        outcome: "SUCCEEDED",
                    },
                    metadata: {
                        creatorReference: provider.creatorReference,
                        creatorUserId: withdrawal.creatorUserId.toString(),
                        walletReference: provider.walletReference,
                        destinationReference: withdrawal.destinationReference,
                        providerRequestReference: provider.providerRequestReference,
                        providerExecutionReference: provider.executionReference,
                        finalizationReference: identity.finalizationReference,
                        finalizationOutcome: outcome,
                        reasonCode: outcome ===
                            creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                            ? "WITHDRAWAL_RESERVATION_CONSUMED"
                            : "WITHDRAWAL_RESERVATION_RELEASED",
                        ...(outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED
                            ? { failureCode: provider.terminalResult?.code ??
                                    "INTERNAL_PROVIDER_FAILED" }
                            : {}),
                    },
                    session,
                });
                await this.onStage("BEFORE_COMMIT");
                committed = true;
            });
            return committed;
        }
        finally {
            await session.endSession();
        }
    }
    async finalize(withdrawalReference) {
        if (typeof withdrawalReference !== "string" ||
            !withdrawalReference.trim()) {
            this.fail("Creator withdrawal request was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_WITHDRAWAL_NOT_FOUND");
        }
        const reference = withdrawalReference.trim();
        const existing = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(reference);
        if (!existing) {
            this.fail("Creator withdrawal request was not found.", "CREATOR_WITHDRAWAL_FINALIZATION_WITHDRAWAL_NOT_FOUND");
        }
        if ([
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
        ].includes(existing.status)) {
            return this.validateReplay(reference);
        }
        if (existing.status !== creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED) {
            this.fail("Withdrawal is not RESERVED for finalization.", "CREATOR_WITHDRAWAL_FINALIZATION_INVALID_WITHDRAWAL_STATUS");
        }
        const graph = await this.loadGraph(reference);
        await this.validateReservationGraph(graph.withdrawal);
        await this.validateProviderGraph(reference);
        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const committed = await this.finalizeTransaction(reference);
                if (!committed) {
                    this.fail("Withdrawal finalization did not commit.", "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT");
                }
                const result = await this.validateReplay(reference);
                return { ...result, replay: false };
            }
            catch (error) {
                lastError = error;
                const winner = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(reference);
                if (winner && [
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
                ].includes(winner.status)) {
                    return this.validateReplay(reference);
                }
                if (error instanceof CreatorWithdrawalFinalizationError_1.CreatorWithdrawalFinalizationError &&
                    error.code !==
                        "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT") {
                    throw error;
                }
                if (!isTransientTransactionError(error))
                    break;
            }
        }
        if (lastError instanceof CreatorWithdrawalFinalizationError_1.CreatorWithdrawalFinalizationError) {
            throw lastError;
        }
        if (lastError instanceof LedgerError_1.LedgerError) {
            this.fail("Withdrawal finalization Ledger failed.", "CREATOR_WITHDRAWAL_FINALIZATION_LEDGER_CONFLICT", lastError);
        }
        this.fail("Withdrawal finalization transaction failed.", "CREATOR_WITHDRAWAL_FINALIZATION_TRANSACTION_CONFLICT", lastError);
    }
}
exports.CreatorWithdrawalFinalizationService = CreatorWithdrawalFinalizationService;
exports.creatorWithdrawalFinalizationService = new CreatorWithdrawalFinalizationService();
