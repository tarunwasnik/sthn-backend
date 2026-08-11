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
exports.bookingCreatorSettlementRetryService = exports.BookingCreatorSettlementRetryService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const bookingCreatorSettlementStatus_enum_1 = require("../../enums/financial/bookingCreatorSettlementStatus.enum");
const BookingCreatorSettlementOperationalError_1 = require("../../errors/financial/BookingCreatorSettlementOperationalError");
const bookingCreatorSettlementReconciliation_repository_1 = require("../../repositories/bookingCreatorSettlementReconciliation.repository");
const bookingCreatorSettlement_repository_1 = require("../../repositories/bookingCreatorSettlement.repository");
const bookingCreatorSettlementRetryAttempt_repository_1 = require("../../repositories/bookingCreatorSettlementRetryAttempt.repository");
const auditLog_service_1 = require("../auditLog.service");
const bookingCreatorSettlementOperationalInspection_service_1 = require("./bookingCreatorSettlementOperationalInspection.service");
const bookingCreatorSettlement_service_1 = require("./bookingCreatorSettlement.service");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
class BookingCreatorSettlementRetryService {
    async retry(reconciliationReference, actor = { type: "SYSTEM" }, reason = "Retry deterministic settlement completion guard") {
        const reconciliation = await bookingCreatorSettlementReconciliation_repository_1.bookingCreatorSettlementReconciliationRepository.findByReference(reconciliationReference);
        if (!reconciliation) {
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement reconciliation was not found.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        }
        const inspection = await bookingCreatorSettlementOperationalInspection_service_1.bookingCreatorSettlementOperationalInspectionService.inspect(reconciliation.settlementReference);
        if (inspection.classification !== bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED ||
            inspection.settlement.status !== bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING ||
            !inspection.financialEffectValid ||
            !inspection.auditValid ||
            !inspection.replayMetadataValid) {
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Only a fully proven interrupted PENDING completion guard may be retried.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RETRY_NOT_ALLOWED");
        }
        const operationKey = `booking-creator-settlement-retry:${reconciliationReference}:` +
            inspection.snapshotFingerprint;
        const operationReference = `BCSRT-${hash(operationKey).slice(0, 20).toUpperCase()}`;
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const existing = await bookingCreatorSettlementRetryAttempt_repository_1.bookingCreatorSettlementRetryAttemptRepository
                    .findByOperationKey(operationKey, session);
                if (existing?.status === "APPLIED") {
                    result = {
                        operationReference: existing.operationReference,
                        settlementReference: inspection.settlement.settlementReference,
                        status: existing.status,
                        resultCode: existing.resultCode,
                        replay: true,
                    };
                    return;
                }
                await bookingCreatorSettlementRetryAttempt_repository_1.bookingCreatorSettlementRetryAttemptRepository.create({
                    operationReference,
                    operationKey,
                    reconciliationId: reconciliation._id,
                    reconciliationReference,
                    settlementId: inspection.settlement._id,
                    settlementReference: inspection.settlement.settlementReference,
                    actorType: actor.type,
                    actorId: actor.id ? new mongoose_1.Types.ObjectId(actor.id) : undefined,
                    reason,
                    startedAt: new Date(),
                }, session);
                const completed = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository
                    .guardOperationalPendingToSettled({
                    settlementId: inspection.settlement._id,
                    settlementKey: inspection.settlement.settlementKey,
                    settlementFingerprint: inspection.settlement.settlementFingerprint,
                    settlementTransactionId: inspection.settlement.settlementTransactionId,
                    settlementProjectionOperationReference: inspection.settlement.settlementProjectionOperationReference,
                    ledgerEntryIds: inspection.ledgerEntryIds,
                    settledAt: new Date(),
                    expectedVersion: inspection.settlement.version,
                }, session);
                if (!completed) {
                    throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement completion guard retry lost authority.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
                }
                const attempt = await bookingCreatorSettlementRetryAttempt_repository_1.bookingCreatorSettlementRetryAttemptRepository.complete(operationKey, "PENDING_TO_SETTLED_APPLIED", new Date(), session);
                if (!attempt) {
                    throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement retry attempt did not complete.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
                }
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_RETRIED,
                    actor: actor.type === "ADMIN"
                        ? { type: "ADMIN", id: new mongoose_1.Types.ObjectId(actor.id) }
                        : { type: "SYSTEM", reference: "booking-creator-settlement-retry" },
                    entityType: "BOOKING_CREATOR_SETTLEMENT_RETRY",
                    entityId: attempt._id,
                    financialContext: {
                        domain: "BOOKING_WALLET",
                        primaryReference: operationReference,
                        settlementReference: completed.settlementReference,
                        amount: completed.creatorAmount,
                        currency: completed.currency,
                    },
                    transition: {
                        fromStatus: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
                        toStatus: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
                        outcome: "SUCCEEDED",
                    },
                    metadata: {
                        operationReference,
                        classification: bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED,
                        reasonCode: "PENDING_COMPLETION_GUARD_RETRIED",
                    },
                    session,
                });
                result = {
                    operationReference,
                    settlementReference: completed.settlementReference,
                    status: attempt.status,
                    resultCode: attempt.resultCode,
                    replay: false,
                };
            });
            if (!result) {
                throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement retry returned no result.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
            }
            await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(inspection.settlement.bookingId.toString());
            return result;
        }
        catch (error) {
            const winner = await bookingCreatorSettlementRetryAttempt_repository_1.bookingCreatorSettlementRetryAttemptRepository
                .findByOperationKey(operationKey);
            if (winner?.status === "APPLIED") {
                await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(inspection.settlement.bookingId.toString());
                return {
                    operationReference: winner.operationReference,
                    settlementReference: inspection.settlement.settlementReference,
                    status: winner.status,
                    resultCode: winner.resultCode,
                    replay: true,
                };
            }
            if (error instanceof BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError)
                throw error;
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement retry transaction failed.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.BookingCreatorSettlementRetryService = BookingCreatorSettlementRetryService;
exports.bookingCreatorSettlementRetryService = new BookingCreatorSettlementRetryService();
