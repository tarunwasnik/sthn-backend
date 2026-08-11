"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingCreatorSettlementOperationalInspectionService = exports.BookingCreatorSettlementOperationalInspectionService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementFailureClassification_enum_1 = require("../../enums/financial/bookingCreatorSettlementFailureClassification.enum");
const bookingCreatorSettlementStatus_enum_1 = require("../../enums/financial/bookingCreatorSettlementStatus.enum");
const bookingEscrowAllocationStatus_enum_1 = require("../../enums/financial/bookingEscrowAllocationStatus.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingCreatorSettlementOperationalError_1 = require("../../errors/financial/BookingCreatorSettlementOperationalError");
const auditLog_model_1 = require("../../models/auditLog.model");
const booking_model_1 = require("../../models/booking.model");
const bookingEscrowAllocation_model_1 = require("../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../models/bookingFundReservation.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const payment_model_1 = require("../../models/payment.model");
const wallet_model_1 = require("../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../models/walletProjectionOperation.model");
const bookingCreatorSettlement_repository_1 = require("../../repositories/bookingCreatorSettlement.repository");
const bookingCreatorSettlementIdentity_util_1 = require("../../utils/financial/bookingCreatorSettlementIdentity.util");
const marketplacePricing_service_1 = require("./marketplacePricing.service");
const hash = (value) => node_crypto_1.default.createHash("sha256").update(value).digest("hex");
class BookingCreatorSettlementOperationalInspectionService {
    async inspect(settlementReference, session) {
        const settlement = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findBySettlementReference(settlementReference, session);
        if (!settlement) {
            throw new BookingCreatorSettlementOperationalError_1.BookingCreatorSettlementOperationalError("Creator settlement was not found.", "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_SETTLEMENT_NOT_FOUND");
        }
        const [booking, payment, reservation, allocation, creator, wallet] = await Promise.all([
            booking_model_1.Booking.findById(settlement.bookingId).session(session ?? null),
            payment_model_1.Payment.findById(settlement.paymentId)
                .select("+walletId +reservationId").session(session ?? null),
            bookingFundReservation_model_1.BookingFundReservation.findById(settlement.reservationId)
                .select("+captureKey +captureTransactionId +captureLedgerEntryIds " +
                "+captureProjectionOperationId +captureProjectionOperationReference " +
                "+captureFingerprint").session(session ?? null),
            bookingEscrowAllocation_model_1.BookingEscrowAllocation.findById(settlement.allocationId)
                .select("+allocationKey +escrowLedgerTransaction " +
                "+allocationLedgerTransaction +allocationLedgerEntryIds " +
                "+allocationFingerprint").session(session ?? null),
            creatorProfile_model_1.CreatorProfile.findById(settlement.creatorId).session(session ?? null),
            wallet_model_1.Wallet.findById(settlement.creatorWalletId).session(session ?? null),
        ]);
        const issues = [];
        const add = (issue) => {
            if (!issues.includes(issue))
                issues.push(issue);
        };
        if (!booking)
            add("BOOKING_NOT_FOUND");
        if (!payment)
            add("PAYMENT_NOT_FOUND");
        if (!reservation)
            add("RESERVATION_NOT_FOUND");
        if (!allocation)
            add("ALLOCATION_NOT_FOUND");
        if (!creator)
            add("CREATOR_NOT_FOUND");
        if (!wallet)
            add("WALLET_NOT_FOUND");
        let coreValid = false;
        let identity = null;
        if (booking && payment && reservation && allocation && creator && wallet) {
            try {
                marketplacePricing_service_1.marketplacePricingService.validate({
                    serviceAmount: booking.serviceAmount,
                    platformFeeAmount: booking.platformFeeAmount,
                    commissionAmount: booking.commissionAmount,
                    creatorAmount: booking.creatorAmount,
                    totalAmount: booking.totalAmount,
                    currency: booking.currency,
                });
            }
            catch {
                add("BOOKING_PRICING_CONFLICT");
            }
            if (booking.status !== "COMPLETED")
                add("BOOKING_NOT_COMPLETED");
            if (payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED)
                add("PAYMENT_NOT_CAPTURED");
            if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
                add("RESERVATION_NOT_CAPTURED");
            }
            if (allocation.status !== bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED) {
                add("ALLOCATION_NOT_ALLOCATED");
            }
            if (!booking.bookingReference ||
                !reservation.captureTransactionId ||
                !allocation.allocationLedgerTransaction) {
                add("SOURCE_IDENTITY_INCOMPLETE");
            }
            else {
                identity = (0, bookingCreatorSettlementIdentity_util_1.deriveBookingCreatorSettlementIdentity)({
                    allocationId: allocation._id,
                    allocationReference: allocation.allocationReference,
                    bookingId: booking._id,
                    bookingReference: booking.bookingReference,
                    paymentId: payment._id,
                    paymentReference: payment.paymentReference,
                    reservationId: reservation._id,
                    reservationReference: reservation.reservationReference,
                    customerUserId: booking.userId,
                    creatorId: creator._id,
                    creatorUserId: creator.userId,
                    creatorWalletId: wallet._id,
                    bookingAmount: allocation.bookingAmount,
                    currency: allocation.currency,
                    commissionAmount: allocation.commissionAmount,
                    creatorAmount: allocation.creatorAmount,
                    captureTransactionId: reservation.captureTransactionId,
                    allocationTransactionId: allocation.allocationLedgerTransaction,
                });
                coreValid =
                    settlement.settlementKey === identity.settlementKey &&
                        settlement.settlementReference === identity.settlementReference &&
                        settlement.settlementFingerprint === identity.settlementFingerprint &&
                        settlement.settlementTransactionId === identity.settlementTransactionId &&
                        settlement.settlementProjectionOperationReference ===
                            identity.settlementProjectionOperationReference &&
                        settlement.bookingId.equals(booking._id) &&
                        settlement.paymentId.equals(payment._id) &&
                        settlement.reservationId.equals(reservation._id) &&
                        settlement.allocationId.equals(allocation._id) &&
                        settlement.customerUserId.equals(booking.userId) &&
                        settlement.creatorUserId.equals(creator.userId) &&
                        settlement.creatorWalletId.equals(wallet._id) &&
                        wallet.userId.equals(creator.userId) &&
                        payment.bookingId.equals(booking._id) &&
                        reservation.bookingId.equals(booking._id) &&
                        allocation.bookingId.equals(booking._id) &&
                        payment.amount === booking.totalAmount &&
                        payment.serviceAmount === booking.serviceAmount &&
                        payment.customerFeeAmount === booking.platformFeeAmount &&
                        payment.grossEscrowAmount === booking.totalAmount &&
                        reservation.amount === booking.totalAmount &&
                        allocation.bookingAmount === booking.totalAmount &&
                        allocation.serviceAmount === booking.serviceAmount &&
                        allocation.platformFeeAmount === booking.platformFeeAmount &&
                        allocation.totalAmount === booking.totalAmount &&
                        allocation.commissionAmount === booking.commissionAmount &&
                        allocation.creatorAmount === booking.creatorAmount &&
                        settlement.bookingAmount === allocation.bookingAmount &&
                        settlement.commissionAmount === allocation.commissionAmount &&
                        settlement.creatorAmount === allocation.creatorAmount &&
                        settlement.currency === allocation.currency &&
                        wallet.currency === allocation.currency;
                if (!coreValid)
                    add("SETTLEMENT_IDENTITY_CONFLICT");
            }
        }
        const entries = identity
            ? await ledgerEntry_model_1.LedgerEntry.find({
                transactionId: identity.settlementTransactionId,
            }).select("+postingKey").session(session ?? null)
            : [];
        const allocationSettlementEntries = allocation
            ? await ledgerEntry_model_1.LedgerEntry.find({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
                "metadata.allocationReference": allocation.allocationReference,
            }).select("+postingKey").session(session ?? null)
            : [];
        const transactionEntryIdSet = new Set(entries.map((entry) => entry._id.toString()));
        const ledgerCommonValid = entries.length === 2 &&
            allocationSettlementEntries.length === 2 &&
            allocationSettlementEntries.every((entry) => transactionEntryIdSet.has(entry._id.toString())) &&
            entries.every((entry) => entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_CREATOR_SETTLED &&
                entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT &&
                entry.bookingId?.equals(settlement.bookingId) &&
                entry.paymentId?.equals(settlement.paymentId) &&
                entry.settlementId?.equals(settlement._id) &&
                entry.userId?.equals(settlement.creatorUserId) &&
                entry.metadata?.reservationReference ===
                    reservation?.reservationReference &&
                entry.metadata?.allocationReference ===
                    allocation?.allocationReference &&
                entry.metadata?.settlementReference ===
                    settlement.settlementReference &&
                entry.metadata?.creatorId === settlement.creatorId.toString() &&
                entry.metadata?.creatorUserId === settlement.creatorUserId.toString() &&
                entry.metadata?.creatorWalletId ===
                    settlement.creatorWalletId.toString());
        const payableDebit = identity && entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.postingKey === identity.creatorPayableDebitPostingKey &&
            entry.amount === settlement.creatorAmount &&
            entry.currency === settlement.currency &&
            entry.userId?.equals(settlement.creatorUserId) &&
            !entry.walletId);
        const walletCredit = identity && entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.postingKey === identity.walletAvailableCreditPostingKey &&
            entry.amount === settlement.creatorAmount &&
            entry.currency === settlement.currency &&
            entry.userId?.equals(settlement.creatorUserId) &&
            entry.walletId?.equals(settlement.creatorWalletId));
        const ledgerValid = ledgerCommonValid && !!payableDebit && !!walletCredit;
        if (entries.length && !ledgerValid)
            add("SETTLEMENT_LEDGER_CONFLICT");
        const projection = identity
            ? await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
                operationKey: identity.projectionOperationKey,
            }).select("+fingerprint").session(session ?? null)
            : null;
        const ledgerIds = entries.map((entry) => entry._id);
        const entryIdSet = new Set(ledgerIds.map(String));
        const expectedProjectionFingerprint = identity && creator && allocation
            ? hash([
                creator.userId.toString(),
                allocation.currency,
                identity.projectionOperationKey,
                allocation.creatorAmount,
                0,
                0,
                0,
                0,
                0,
                ledgerIds.slice()
                    .sort((a, b) => a.toString().localeCompare(b.toString()))
                    .map(String).join(","),
            ].join("|"))
            : null;
        const projectionValid = !!projection && ledgerValid &&
            projection.operationReference ===
                identity?.settlementProjectionOperationReference &&
            projection.fingerprint === expectedProjectionFingerprint &&
            projection.walletId.equals(settlement.creatorWalletId) &&
            projection.userId.equals(settlement.creatorUserId) &&
            projection.currency === settlement.currency &&
            projection.deltas.availableBalance === settlement.creatorAmount &&
            projection.deltas.reservedBalance === 0 &&
            projection.deltas.lockedBalance === 0 &&
            projection.ledgerEntryIds.length === 2 &&
            new Set(projection.ledgerEntryIds.map(String)).size === 2 &&
            projection.ledgerEntryIds.every((id) => entryIdSet.has(id.toString()));
        if (projection && !projectionValid)
            add("SETTLEMENT_PROJECTION_CONFLICT");
        const walletValid = !!wallet &&
            wallet.userId.equals(settlement.creatorUserId) &&
            wallet.currency === settlement.currency &&
            wallet.currentBalance ===
                wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance &&
            (!projection || wallet.projectionVersion >= projection.projectionVersion);
        if (wallet && !walletValid)
            add("SETTLEMENT_WALLET_CONFLICT");
        const auditCount = await auditLog_model_1.AuditLog.countDocuments({
            action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
            entityId: settlement._id,
            "financialContext.primaryReference": settlement.settlementReference,
        }).session(session ?? null);
        const auditValid = auditCount === 1;
        if (!auditValid)
            add(auditCount === 0 ? "SETTLEMENT_AUDIT_MISSING" : "SETTLEMENT_AUDIT_DUPLICATED");
        const replayMetadataValid = settlement.settlementLedgerEntryIds.length === 2 &&
            settlement.settlementLedgerEntryIds.every((id) => entryIdSet.has(id.toString()));
        if (!replayMetadataValid && ledgerValid)
            add("REPLAY_METADATA_MISSING");
        const financialEffectValid = coreValid && ledgerValid && projectionValid && walletValid;
        let classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.UNKNOWN;
        if (!coreValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_SETTLEMENT;
        else if (entries.length > 0 && !ledgerValid) {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_LEDGER;
        }
        else if (projection && !projectionValid) {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_PROJECTION;
        }
        else if (!walletValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.INTEGRITY_FAILURE;
        else if (settlement.status === bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING &&
            !entries.length &&
            !projection) {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.PENDING;
        }
        else if (settlement.status === bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING &&
            financialEffectValid) {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED;
        }
        else if (!ledgerValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_LEDGER;
        else if (!projectionValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_PROJECTION;
        else if (!auditValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.MISSING_AUDIT;
        else if (!replayMetadataValid)
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.REPLAY_REQUIRED;
        else if (settlement.status === bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED &&
            settlement.settledAt) {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.HEALTHY;
        }
        else {
            classification = bookingCreatorSettlementFailureClassification_enum_1.BookingCreatorSettlementFailureClassification.CORRUPTED_SETTLEMENT;
        }
        const snapshot = {
            settlementReference: settlement.settlementReference,
            settlementStatus: settlement.status,
            bookingStatus: booking?.status,
            paymentStatus: payment?.status,
            reservationStatus: reservation?.status,
            allocationStatus: allocation?.status,
            amount: settlement.creatorAmount,
            currency: settlement.currency,
            ledgerEntryCount: entries.length,
            projectionPresent: !!projection,
            walletIntegrityValid: walletValid,
            auditCount,
            replayMetadataValid,
            classification,
            issueCodes: issues,
        };
        return {
            settlement,
            classification,
            issues,
            snapshot,
            snapshotFingerprint: hash(JSON.stringify(snapshot)),
            bookingReference: booking?.bookingReference ?? "UNKNOWN",
            allocationReference: allocation?.allocationReference ?? "UNKNOWN",
            walletReference: `WAL-${hash(settlement.creatorWalletId.toString()).slice(0, 16).toUpperCase()}`,
            creatorReference: creator?.slug ?? "UNKNOWN",
            ledgerEntryIds: ledgerIds,
            financialEffectValid,
            auditValid,
            replayMetadataValid,
        };
    }
}
exports.BookingCreatorSettlementOperationalInspectionService = BookingCreatorSettlementOperationalInspectionService;
exports.bookingCreatorSettlementOperationalInspectionService = new BookingCreatorSettlementOperationalInspectionService();
