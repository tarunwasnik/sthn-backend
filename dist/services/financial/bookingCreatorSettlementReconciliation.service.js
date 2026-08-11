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
exports.bookingCreatorSettlementReconciliationService = exports.BookingCreatorSettlementReconciliationService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const bookingCreatorSettlementReconciliation_enum_1 = require("../../enums/financial/bookingCreatorSettlementReconciliation.enum");
const BookingCreatorSettlementOperationalError_1 = require("../../errors/financial/BookingCreatorSettlementOperationalError");
const bookingCreatorSettlementReconciliation_repository_1 = require("../../repositories/bookingCreatorSettlementReconciliation.repository");
const auditLog_service_1 = require("../auditLog.service");
const bookingCreatorSettlementOperationalInspection_service_1 = require("./bookingCreatorSettlementOperationalInspection.service");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
class BookingCreatorSettlementReconciliationService {
    async reconcile(settlementReference, actor = { type: "SYSTEM" }) {
        const inspection = await bookingCreatorSettlementOperationalInspection_service_1.bookingCreatorSettlementOperationalInspectionService.inspect(settlementReference);
        const session = await mongoose_1.default.startSession();
        try {
            const resultBox = { value: null };
            await session.withTransaction(async () => {
                const checkedAt = new Date();
                const healthy = inspection.classification === bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.HEALTHY;
                const reconciliationReference = `BCSR-${hash(settlementReference).slice(0, 20).toUpperCase()}`;
                const reconciliation = await bookingCreatorSettlementReconciliation_repository_1.bookingCreatorSettlementReconciliationRepository
                    .upsertObservation({
                    reconciliationReference,
                    reconciliationKey: `booking-creator-settlement-reconciliation:${settlementReference}`,
                    settlementId: inspection.settlement._id,
                    settlementReference,
                    bookingReference: inspection.bookingReference,
                    allocationReference: inspection.allocationReference,
                    walletReference: inspection.walletReference,
                    creatorReference: inspection.creatorReference,
                    status: healthy ? bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationStatus.RESOLVED : bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationStatus.OPEN,
                    result: healthy ? bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationResult.VALID : bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementReconciliationResult.ISSUES_FOUND,
                    classification: inspection.classification,
                    issuesFound: inspection.issues,
                    checkedAt,
                    snapshot: inspection.snapshot,
                    snapshotFingerprint: inspection.snapshotFingerprint,
                }, session);
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_RECONCILED,
                    actor: actor.type === "ADMIN"
                        ? { type: "ADMIN", id: new mongoose_1.Types.ObjectId(actor.id) }
                        : { type: "SYSTEM", reference: "booking-creator-settlement-reconciliation" },
                    entityType: "BOOKING_CREATOR_SETTLEMENT_RECONCILIATION",
                    entityId: reconciliation._id,
                    financialContext: {
                        domain: "BOOKING_WALLET",
                        primaryReference: reconciliation.reconciliationReference,
                        settlementReference,
                        bookingReference: inspection.bookingReference,
                        amount: inspection.settlement.creatorAmount,
                        currency: inspection.settlement.currency,
                    },
                    transition: {
                        toStatus: reconciliation.status,
                        outcome: healthy ? "SUCCEEDED" : "CONFLICT",
                    },
                    metadata: {
                        classification: inspection.classification,
                        reasonCode: healthy
                            ? "SETTLEMENT_INTEGRITY_VALID"
                            : inspection.classification,
                    },
                    session,
                });
                resultBox.value = {
                    reconciliationReference: reconciliation.reconciliationReference,
                    settlementReference,
                    bookingReference: inspection.bookingReference,
                    allocationReference: inspection.allocationReference,
                    walletReference: inspection.walletReference,
                    creatorReference: inspection.creatorReference,
                    status: reconciliation.status,
                    result: reconciliation.result,
                    classification: reconciliation.classification,
                    issuesFound: reconciliation.issuesFound,
                    checkedAt: reconciliation.checkedAt,
                    version: reconciliation.version,
                };
            });
            if (!resultBox.value) {
                throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement reconciliation did not commit.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT");
            }
            return resultBox.value;
        }
        catch (error) {
            if (error instanceof BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError)
                throw error;
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Settlement reconciliation transaction failed.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.BookingCreatorSettlementReconciliationService = BookingCreatorSettlementReconciliationService;
exports.bookingCreatorSettlementReconciliationService = new BookingCreatorSettlementReconciliationService();
