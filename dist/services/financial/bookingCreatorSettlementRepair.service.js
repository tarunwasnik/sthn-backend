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
exports.bookingCreatorSettlementRepairService = exports.BookingCreatorSettlementRepairService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const bookingCreatorSettlementReconciliation_enum_1 = require("../../enums/financial/bookingCreatorSettlementReconciliation.enum");
const bookingCreatorSettlementStatus_enum_1 = require("../../enums/financial/bookingCreatorSettlementStatus.enum");
const BookingCreatorSettlementOperationalError_1 = require("../../errors/financial/BookingCreatorSettlementOperationalError");
const bookingCreatorSettlementReconciliation_repository_1 = require("../../repositories/bookingCreatorSettlementReconciliation.repository");
const bookingCreatorSettlementRepairOperation_repository_1 = require("../../repositories/bookingCreatorSettlementRepairOperation.repository");
const bookingCreatorSettlement_repository_1 = require("../../repositories/bookingCreatorSettlement.repository");
const auditLog_service_1 = require("../auditLog.service");
const bookingCreatorSettlementOperationalInspection_service_1 = require("./bookingCreatorSettlementOperationalInspection.service");
const bookingCreatorSettlement_service_1 = require("./bookingCreatorSettlement.service");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
class BookingCreatorSettlementRepairService {
    async repair(reconciliationReference, action, adminUserId, reason = "Bounded deterministic settlement metadata repair") {
        const reconciliation = await bookingCreatorSettlementReconciliation_repository_1.bookingCreatorSettlementReconciliationRepository.findByReference(reconciliationReference);
        if (!reconciliation) {
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement reconciliation was not found.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RECONCILIATION_NOT_FOUND");
        }
        const inspection = await bookingCreatorSettlementOperationalInspection_service_1.bookingCreatorSettlementOperationalInspectionService.inspect(reconciliation.settlementReference);
        const operationKey = `booking-creator-settlement-repair:${reconciliationReference}:${action}`;
        const operationReference = `BCSRP-${hash(operationKey).slice(0, 20).toUpperCase()}`;
        const existing = await bookingCreatorSettlementRepairOperation_repository_1.bookingCreatorSettlementRepairOperationRepository
            .findByOperationKey(operationKey);
        if (existing?.status === "APPLIED") {
            await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(inspection.settlement.bookingId.toString());
            return {
                operationReference: existing.operationReference,
                settlementReference: inspection.settlement.settlementReference,
                action,
                status: existing.status,
                repairedFields: existing.repairedFields,
                replay: true,
            };
        }
        const allowed = inspection.settlement.status === bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED &&
            inspection.financialEffectValid &&
            (action === bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_MISSING_AUDIT &&
                inspection.classification === bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.MISSING_AUDIT ||
                action === bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_REPLAY_METADATA &&
                    inspection.classification === bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED &&
                    !inspection.replayMetadataValid);
        if (!allowed) {
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Requested repair is not allowed for this settlement classification.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_REPAIR_NOT_ALLOWED");
        }
        const session = await mongoose_1.default.startSession();
        try {
            let result = null;
            await session.withTransaction(async () => {
                const existing = await bookingCreatorSettlementRepairOperation_repository_1.bookingCreatorSettlementRepairOperationRepository
                    .findByOperationKey(operationKey, session);
                if (existing?.status === "APPLIED") {
                    result = {
                        operationReference: existing.operationReference,
                        settlementReference: inspection.settlement.settlementReference,
                        action,
                        status: existing.status,
                        repairedFields: existing.repairedFields,
                        replay: true,
                    };
                    return;
                }
                const operation = await bookingCreatorSettlementRepairOperation_repository_1.bookingCreatorSettlementRepairOperationRepository.create({
                    operationReference,
                    operationKey,
                    reconciliationId: reconciliation._id,
                    reconciliationReference,
                    settlementId: inspection.settlement._id,
                    settlementReference: inspection.settlement.settlementReference,
                    action,
                    snapshotFingerprint: inspection.snapshotFingerprint,
                    actorId: new mongoose_1.Types.ObjectId(adminUserId),
                    reason,
                }, session);
                const repairedFields = [];
                if (action === bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_MISSING_AUDIT) {
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                        actor: {
                            type: "SYSTEM",
                            reference: "booking-creator-wallet-settlement-repair",
                        },
                        entityType: "BOOKING_CREATOR_SETTLEMENT",
                        entityId: inspection.settlement._id,
                        financialContext: {
                            domain: "BOOKING_WALLET",
                            primaryReference: inspection.settlement.settlementReference,
                            bookingReference: inspection.bookingReference,
                            settlementReference: inspection.settlement.settlementReference,
                            amount: inspection.settlement.creatorAmount,
                            currency: inspection.settlement.currency,
                            ledgerTransactionReference: inspection.settlement.settlementTransactionId,
                            projectionOperationReference: inspection.settlement.settlementProjectionOperationReference,
                        },
                        transition: {
                            fromStatus: "PENDING",
                            toStatus: "SETTLED",
                            outcome: "SUCCEEDED",
                        },
                        metadata: {
                            classification: "CREATOR_PAYABLE_WALLET_SETTLEMENT",
                            reasonCode: "MISSING_SETTLEMENT_AUDIT_RESTORED",
                        },
                        session,
                    });
                    repairedFields.push("settlementAudit");
                }
                else {
                    const restored = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.guardRestoreLedgerEntryIds({
                        settlementId: inspection.settlement._id,
                        settlementKey: inspection.settlement.settlementKey,
                        settlementFingerprint: inspection.settlement.settlementFingerprint,
                        settlementTransactionId: inspection.settlement.settlementTransactionId,
                        ledgerEntryIds: inspection.ledgerEntryIds,
                        expectedVersion: inspection.settlement.version,
                    }, session);
                    if (!restored) {
                        throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement replay metadata repair lost authority.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
                    }
                    repairedFields.push("settlementLedgerEntryIds");
                }
                const completed = await bookingCreatorSettlementRepairOperation_repository_1.bookingCreatorSettlementRepairOperationRepository.complete(operationKey, repairedFields, new Date(), session);
                if (!completed) {
                    throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement repair operation did not complete.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
                }
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_REPAIRED,
                    actor: { type: "ADMIN", id: new mongoose_1.Types.ObjectId(adminUserId) },
                    entityType: "BOOKING_CREATOR_SETTLEMENT_REPAIR",
                    entityId: operation._id,
                    financialContext: {
                        domain: "BOOKING_WALLET",
                        primaryReference: operationReference,
                        settlementReference: inspection.settlement.settlementReference,
                        amount: inspection.settlement.creatorAmount,
                        currency: inspection.settlement.currency,
                    },
                    transition: { toStatus: "APPLIED", outcome: "SUCCEEDED" },
                    metadata: {
                        operationReference,
                        classification: inspection.classification,
                        reasonCode: action,
                    },
                    session,
                });
                result = {
                    operationReference,
                    settlementReference: inspection.settlement.settlementReference,
                    action,
                    status: completed.status,
                    repairedFields,
                    replay: false,
                };
            });
            if (!result) {
                throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement repair returned no result.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
            }
            await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(inspection.settlement.bookingId.toString());
            return result;
        }
        catch (error) {
            const winner = await bookingCreatorSettlementRepairOperation_repository_1.bookingCreatorSettlementRepairOperationRepository
                .findByOperationKey(operationKey);
            if (winner?.status === "APPLIED") {
                await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(inspection.settlement.bookingId.toString());
                return {
                    operationReference: winner.operationReference,
                    settlementReference: inspection.settlement.settlementReference,
                    action,
                    status: winner.status,
                    repairedFields: winner.repairedFields,
                    replay: true,
                };
            }
            if (error instanceof BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError)
                throw error;
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement repair transaction failed.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.BookingCreatorSettlementRepairService = BookingCreatorSettlementRepairService;
exports.bookingCreatorSettlementRepairService = new BookingCreatorSettlementRepairService();
