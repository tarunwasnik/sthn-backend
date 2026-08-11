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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalRequestService = exports.CreatorWithdrawalRequestService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const CreatorWithdrawalRequestError_1 = require("../../errors/financial/CreatorWithdrawalRequestError");
const LedgerError_1 = require("../../errors/financial/LedgerError");
const WalletError_1 = require("../../errors/financial/WalletError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const bookingCreatorSettlement_repository_1 = require("../../repositories/bookingCreatorSettlement.repository");
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const payoutDestination_repository_1 = require("../../repositories/payoutDestination.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const money_util_1 = require("../../utils/financial/money.util");
const creatorWithdrawalRequestIdentity_util_1 = require("../../utils/financial/creatorWithdrawalRequestIdentity.util");
const accountGovernanceResolver_service_1 = require("../accountGovernance/accountGovernanceResolver.service");
const auditLog_service_1 = require("../auditLog.service");
const ledger_service_1 = require("./ledger.service");
const bookingCreatorSettlementOperationalInspection_service_1 = require("./bookingCreatorSettlementOperationalInspection.service");
const withdrawalEligibility_service_1 = require("./withdrawalEligibility.service");
const withdrawal_repository_1 = require("../../repositories/withdrawal.repository");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
class CreatorWithdrawalRequestService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    fail(message, code, cause) {
        throw new CreatorWithdrawalRequestError_1.CreatorWithdrawalRequestError(message, code, { cause });
    }
    validateInput(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.authenticatedUserId) ||
            !(0, money_util_1.isValidMoney)(input.amount) ||
            input.amount.amount <= 0 ||
            !(0, idempotency_util_1.isValidIdempotencyKey)(input.idempotencyKey) ||
            typeof input.destinationReference !== "string" ||
            !input.destinationReference.trim()) {
            this.fail("Invalid Creator withdrawal request.", "CREATOR_WITHDRAWAL_INVALID_REQUEST");
        }
    }
    async resolveContext(input, session) {
        const creatorUserId = new mongoose_1.Types.ObjectId(input.authenticatedUserId);
        const [creator, user, wallet] = await Promise.all([
            creatorProfile_model_1.CreatorProfile.findOne({ userId: creatorUserId })
                .session(session ?? null),
            User_1.default.findById(creatorUserId).session(session ?? null),
            wallet_repository_1.walletRepository.findByUserAndCurrency(creatorUserId, input.amount.currency, session),
        ]);
        if (!creator || creator.status !== "active" || !user ||
            (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user).hasNoAccountAccess) {
            this.fail("Creator is not eligible to request a withdrawal.", "CREATOR_WITHDRAWAL_CREATOR_INACTIVE");
        }
        if (!wallet) {
            const anyWallet = await wallet_repository_1.walletRepository.findAnyByUser(creatorUserId, session);
            this.fail(anyWallet
                ? "Creator Wallet currency does not match the withdrawal."
                : "Creator Wallet was not found.", anyWallet
                ? "CREATOR_WITHDRAWAL_CURRENCY_MISMATCH"
                : "CREATOR_WITHDRAWAL_WALLET_MISSING");
        }
        if (wallet.currentBalance !==
            wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
            this.fail("Creator Wallet integrity validation failed.", "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT");
        }
        if (wallet.lockedBalance > 0) {
            this.fail("Creator Wallet has a financial lock.", "CREATOR_WITHDRAWAL_ELIGIBILITY_FAILURE");
        }
        if (wallet.availableBalance < input.amount.amount) {
            this.fail("Creator Wallet has insufficient available balance.", "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE");
        }
        const destination = await payoutDestination_repository_1.payoutDestinationRepository.findByCreatorAndReference(input.authenticatedUserId, input.destinationReference.trim(), session);
        if (!destination ||
            destination.verificationStatus !==
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
            !destination.isActive ||
            !destination.verifiedAt) {
            this.fail("An active verified withdrawal destination was not found.", "CREATOR_WITHDRAWAL_DESTINATION_MISSING");
        }
        return { creator, wallet, destination };
    }
    async assertSettlementIntegrity(creatorUserId, session) {
        const settlements = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findManyByCreatorUser(creatorUserId, session);
        for (const settlement of settlements) {
            const inspection = await bookingCreatorSettlementOperationalInspection_service_1.bookingCreatorSettlementOperationalInspectionService.inspect(settlement.settlementReference, session);
            if (inspection.classification !== bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.HEALTHY) {
                this.fail("Creator settlement integrity is not healthy.", "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT");
            }
        }
    }
    authorityFingerprint(request) {
        return (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalAuthorityFingerprint)({
            withdrawalReference: request.withdrawalReference,
            creatorId: request.creatorId,
            creatorUserId: request.creatorUserId,
            walletId: request.walletId,
            destinationId: request.destinationId,
            destinationReference: request.destinationReference,
            currency: request.currency,
            amount: request.amount,
        });
    }
    ensureSameIntent(request, fingerprint) {
        if (request.requestFingerprint !== fingerprint) {
            this.fail("Withdrawal replay conflicts with the original immutable request.", "CREATOR_WITHDRAWAL_REPLAY_CONFLICT");
        }
    }
    safe(request, replay) {
        return {
            withdrawalReference: request.withdrawalReference,
            amount: request.amount,
            reservedAmount: request.reservedAmount,
            currency: request.currency,
            status: request.status,
            destinationReference: request.destinationReference,
            projectionReference: request.projectionReference,
            requestedAt: request.requestedAt,
            reservedAt: request.reservedAt,
            replay,
        };
    }
    async validateReplay(withdrawalReference) {
        const request = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference);
        if (!request) {
            this.fail("Creator withdrawal request was not found.", "CREATOR_WITHDRAWAL_REPLAY_CONFLICT");
        }
        const expectedFingerprint = this.authorityFingerprint(request);
        const expectedReference = `CWR-${hash(request.withdrawalKey).slice(0, 20).toUpperCase()}`;
        const transactionReference = `creator-withdrawal-reservation:${request.withdrawalReference}`;
        const operationKey = `${transactionReference}:wallet-projection`;
        const expectedProjectionReference = `WPO-${hash(operationKey).slice(0, 16).toUpperCase()}`;
        const reservationStillHeld = request.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            request.reservedAmount === request.amount;
        const reservationFinalized = [
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
        ].includes(request.status) &&
            request.reservedAmount === 0 &&
            !!request.finalizationReference &&
            !!request.finalizationOutcome;
        if ((!reservationStillHeld && !reservationFinalized) ||
            !request.reservedAt ||
            request.requestFingerprint !== expectedFingerprint ||
            request.withdrawalReference !== expectedReference ||
            request.ledgerTransactionReference !== transactionReference ||
            request.projectionReference !== expectedProjectionReference ||
            request.ledgerEntryIds.length !== 2) {
            this.fail("Creator withdrawal authority conflicts with deterministic identity.", "CREATOR_WITHDRAWAL_REPLAY_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: transactionReference,
        });
        const expectedIds = new Set(request.ledgerEntryIds.map(String));
        const commonValid = entries.length === 2 && entries.every((entry) => expectedIds.has(entry._id.toString()) &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED &&
            entry.source === ledgerSource_enum_1.LedgerSource.CREATOR_WITHDRAWAL_RESERVATION &&
            entry.userId?.equals(request.creatorUserId) &&
            entry.walletId?.equals(request.walletId) &&
            entry.amount === request.amount &&
            entry.currency === request.currency &&
            entry.metadata?.withdrawalReference === request.withdrawalReference &&
            entry.metadata?.destinationReference === request.destinationReference);
        const debit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.postingKey === `${transactionReference}:wallet-available-debit`);
        const credit = entries.find((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED &&
            entry.postingKey === `${transactionReference}:withdrawal-reserved-credit`);
        if (!commonValid || !debit || !credit) {
            this.fail("Creator withdrawal Ledger reservation conflicts.", "CREATOR_WITHDRAWAL_LEDGER_CONFLICT");
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(operationKey);
        const projectionFingerprint = (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalProjectionFingerprint)({
            creatorUserId: request.creatorUserId,
            currency: request.currency,
            operationKey,
            amount: request.amount,
            ledgerEntryIds: request.ledgerEntryIds,
        });
        if (!projection ||
            projection.operationReference !== expectedProjectionReference ||
            projection.fingerprint !== projectionFingerprint ||
            !projection.walletId.equals(request.walletId) ||
            !projection.userId.equals(request.creatorUserId) ||
            projection.currency !== request.currency ||
            projection.deltas.availableBalance !== -request.amount ||
            projection.deltas.reservedBalance !== request.amount ||
            projection.deltas.lockedBalance !== 0 ||
            projection.ledgerEntryIds.length !== 2 ||
            new Set(projection.ledgerEntryIds.map(String)).size !== 2 ||
            !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString()))) {
            this.fail("Creator withdrawal Wallet projection conflicts.", "CREATOR_WITHDRAWAL_PROJECTION_CONFLICT");
        }
        const [wallet, destination, auditCount] = await Promise.all([
            wallet_repository_1.walletRepository.findById(request.walletId),
            payoutDestination_repository_1.payoutDestinationRepository.findByCreatorAndReference(request.creatorUserId.toString(), request.destinationReference),
            auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
                entityId: request._id,
                "financialContext.primaryReference": request.withdrawalReference,
            }),
        ]);
        if (!wallet ||
            !wallet.userId.equals(request.creatorUserId) ||
            wallet.currency !== request.currency ||
            wallet.currentBalance !==
                wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance ||
            wallet.projectionVersion < projection.projectionVersion ||
            !destination ||
            !destination._id.equals(request.destinationId) ||
            destination.verificationStatus !==
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
            !destination.isActive ||
            auditCount !== 1) {
            this.fail("Creator withdrawal integrity validation failed.", "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT");
        }
        await this.assertSettlementIntegrity(request.creatorUserId);
        return this.safe(request, true);
    }
    async request(input) {
        this.validateInput(input);
        const normalizedInput = {
            ...input,
            destinationReference: input.destinationReference.trim(),
            idempotencyKey: (0, idempotency_util_1.normalizeIdempotencyKey)(input.idempotencyKey),
        };
        const replayKey = `creator-withdrawal:` +
            `${normalizedInput.authenticatedUserId}:${normalizedInput.idempotencyKey}`;
        const replay = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByKey(replayKey);
        if (replay) {
            const replayIdentity = (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalRequestIdentity)({
                creatorId: replay.creatorId,
                creatorUserId: replay.creatorUserId,
                walletId: replay.walletId,
                destinationId: replay.destinationId,
                destinationReference: normalizedInput.destinationReference,
                currency: normalizedInput.amount.currency,
                amount: normalizedInput.amount.amount,
                idempotencyKey: normalizedInput.idempotencyKey,
            });
            this.ensureSameIntent(replay, replayIdentity.requestFingerprint);
            return this.validateReplay(replay.withdrawalReference);
        }
        const context = await this.resolveContext(normalizedInput);
        const identity = (0, creatorWithdrawalRequestIdentity_util_1.deriveCreatorWithdrawalRequestIdentity)({
            creatorId: context.creator._id,
            creatorUserId: context.creator.userId,
            walletId: context.wallet._id,
            destinationId: context.destination._id,
            destinationReference: context.destination.destinationReference,
            currency: context.wallet.currency,
            amount: normalizedInput.amount.amount,
            idempotencyKey: normalizedInput.idempotencyKey,
        });
        const existing = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByKey(identity.withdrawalKey);
        if (existing) {
            this.ensureSameIntent(existing, identity.requestFingerprint);
            return this.validateReplay(existing.withdrawalReference);
        }
        const eligibility = await withdrawalEligibility_service_1.withdrawalEligibilityService.evaluate({
            creatorId: normalizedInput.authenticatedUserId,
            amount: normalizedInput.amount,
            destinationReference: normalizedInput.destinationReference,
            balanceSnapshot: {
                currency: context.wallet.currency,
                availableBalance: context.wallet.availableBalance,
            },
        });
        if (!eligibility.allowed) {
            this.fail(`Creator withdrawal eligibility failed: ${eligibility.reason}.`, eligibility.reason === "INSUFFICIENT_BALANCE"
                ? "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE"
                : eligibility.reason === "PENDING_WITHDRAWAL"
                    ? "CREATOR_WITHDRAWAL_EXISTING_WITHDRAWAL"
                    : "CREATOR_WITHDRAWAL_ELIGIBILITY_FAILURE");
        }
        await this.assertSettlementIntegrity(context.creator.userId);
        const session = await mongoose_1.default.startSession();
        let committedReference = null;
        let createdHere = false;
        try {
            await session.withTransaction(async () => {
                const replay = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByKey(identity.withdrawalKey, session);
                if (replay) {
                    this.ensureSameIntent(replay, identity.requestFingerprint);
                    committedReference = replay.withdrawalReference;
                    return;
                }
                const transactionalContext = await this.resolveContext(normalizedInput, session);
                await this.assertSettlementIntegrity(transactionalContext.creator.userId, session);
                if (await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findActiveByCreatorUser(transactionalContext.creator.userId, session) ||
                    await withdrawal_repository_1.withdrawalRepository.findActiveByCreator(normalizedInput.authenticatedUserId, session)) {
                    this.fail("Creator already has an active withdrawal.", "CREATOR_WITHDRAWAL_EXISTING_WITHDRAWAL");
                }
                const requestedAt = new Date();
                const authority = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.createPending({
                    withdrawalReference: identity.withdrawalReference,
                    withdrawalKey: identity.withdrawalKey,
                    creatorId: transactionalContext.creator._id,
                    creatorUserId: transactionalContext.creator.userId,
                    walletId: transactionalContext.wallet._id,
                    destinationId: transactionalContext.destination._id,
                    destinationReference: transactionalContext.destination.destinationReference,
                    currency: transactionalContext.wallet.currency,
                    amount: normalizedInput.amount.amount,
                    requestFingerprint: identity.requestFingerprint,
                    requestedAt,
                }, session);
                createdHere = true;
                await this.onStage("AFTER_AUTHORITY");
                const money = {
                    amount: authority.amount,
                    currency: authority.currency,
                };
                const metadata = {
                    withdrawalReference: authority.withdrawalReference,
                    creatorId: authority.creatorId.toString(),
                    destinationReference: authority.destinationReference,
                };
                const debit = await ledger_service_1.ledgerService.createDebit({
                    type: ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED,
                    source: ledgerSource_enum_1.LedgerSource.CREATOR_WITHDRAWAL_RESERVATION,
                    account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
                    postingKey: identity.availableDebitPostingKey,
                    transactionId: identity.ledgerTransactionReference,
                    userId: authority.creatorUserId.toString(),
                    walletId: authority.walletId.toString(),
                    money,
                    description: "Creator withdrawal available-fund reservation",
                    metadata,
                }, session);
                const credit = await ledger_service_1.ledgerService.createCredit({
                    type: ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED,
                    source: ledgerSource_enum_1.LedgerSource.CREATOR_WITHDRAWAL_RESERVATION,
                    account: ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED,
                    postingKey: identity.reservedCreditPostingKey,
                    transactionId: identity.ledgerTransactionReference,
                    userId: authority.creatorUserId.toString(),
                    walletId: authority.walletId.toString(),
                    money,
                    description: "Creator withdrawal reserved-fund recognition",
                    metadata,
                }, session);
                const ledgerEntryIds = [
                    debit._id,
                    credit._id,
                ];
                await this.onStage("AFTER_LEDGER");
                await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                    userId: authority.creatorUserId,
                    currency: authority.currency,
                    operationKey: identity.projectionOperationKey,
                    deltas: {
                        availableBalance: -authority.amount,
                        reservedBalance: authority.amount,
                        lockedBalance: 0,
                    },
                    minimums: { availableBalance: authority.amount },
                    ledgerEntryIds,
                }, session);
                await this.onStage("AFTER_PROJECTION");
                await this.onStage("BEFORE_RESERVED_TRANSITION");
                const reserved = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.reserve({
                    requestId: authority._id,
                    withdrawalKey: identity.withdrawalKey,
                    requestFingerprint: identity.requestFingerprint,
                    amount: authority.amount,
                    ledgerTransactionReference: identity.ledgerTransactionReference,
                    ledgerEntryIds,
                    projectionReference: identity.projectionReference,
                    reservedAt: new Date(),
                    expectedVersion: authority.version,
                }, session);
                if (!reserved) {
                    this.fail("Creator withdrawal reservation transition conflicted.", "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT");
                }
                await this.onStage("BEFORE_AUDIT");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
                    actor: {
                        type: "CREATOR",
                        id: authority.creatorUserId,
                    },
                    entityType: "CREATOR_WITHDRAWAL_REQUEST",
                    entityId: authority._id,
                    financialContext: {
                        domain: "WITHDRAWAL",
                        primaryReference: authority.withdrawalReference,
                        withdrawalReference: authority.withdrawalReference,
                        amount: authority.amount,
                        currency: authority.currency,
                        ledgerTransactionReference: identity.ledgerTransactionReference,
                        projectionOperationReference: identity.projectionReference,
                    },
                    transition: {
                        fromStatus: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.PENDING,
                        toStatus: creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED,
                        outcome: "SUCCEEDED",
                    },
                    metadata: {
                        creatorReference: transactionalContext.creator.slug,
                        walletReference: `WAL-${hash(authority.walletId.toString()).slice(0, 16).toUpperCase()}`,
                        destinationReference: authority.destinationReference,
                        reasonCode: "CREATOR_WITHDRAWAL_FUNDS_RESERVED",
                    },
                    session,
                });
                await this.onStage("BEFORE_COMMIT");
                committedReference = reserved.withdrawalReference;
            });
            if (!committedReference) {
                this.fail("Creator withdrawal reservation did not commit.", "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT");
            }
            const validated = await this.validateReplay(committedReference);
            return { ...validated, replay: !createdHere };
        }
        catch (error) {
            const winner = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByKey(identity.withdrawalKey);
            if (winner) {
                this.ensureSameIntent(winner, identity.requestFingerprint);
                return this.validateReplay(winner.withdrawalReference);
            }
            if (error instanceof CreatorWithdrawalRequestError_1.CreatorWithdrawalRequestError)
                throw error;
            if (error instanceof LedgerError_1.LedgerError) {
                this.fail("Creator withdrawal Ledger reservation failed.", "CREATOR_WITHDRAWAL_LEDGER_CONFLICT", error);
            }
            if (error instanceof WalletError_1.WalletError) {
                this.fail(error.code === "WALLET_INSUFFICIENT_BALANCE"
                    ? "Creator Wallet has insufficient available balance."
                    : "Creator Wallet projection failed.", error.code === "WALLET_INSUFFICIENT_BALANCE"
                    ? "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE"
                    : "CREATOR_WITHDRAWAL_PROJECTION_CONFLICT", error);
            }
            this.fail("Creator withdrawal reservation transaction failed.", "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.CreatorWithdrawalRequestService = CreatorWithdrawalRequestService;
exports.creatorWithdrawalRequestService = new CreatorWithdrawalRequestService();
