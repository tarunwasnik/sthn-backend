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
exports.bookingCreatorSettlementService = exports.BookingCreatorSettlementService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingCreatorSettlementStatus_enum_1 = require("../../enums/financial/bookingCreatorSettlementStatus.enum");
const bookingEscrowAllocationStatus_enum_1 = require("../../enums/financial/bookingEscrowAllocationStatus.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingCreatorSettlementError_1 = require("../../errors/financial/BookingCreatorSettlementError");
const WalletError_1 = require("../../errors/financial/WalletError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const dispute_model_1 = require("../../models/dispute.model");
const refund_model_1 = require("../../models/refund.model");
const settlement_model_1 = require("../../models/settlement.model");
const User_1 = __importDefault(require("../../models/User"));
const bookingCreatorSettlement_repository_1 = require("../../repositories/bookingCreatorSettlement.repository");
const bookingEscrowAllocation_repository_1 = require("../../repositories/bookingEscrowAllocation.repository");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const booking_repository_1 = require("../../repositories/booking.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const bookingCreatorSettlementIdentity_util_1 = require("../../utils/financial/bookingCreatorSettlementIdentity.util");
const bookingEscrowAllocationIdentity_util_1 = require("../../utils/financial/bookingEscrowAllocationIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const walletIntegrity_service_1 = require("../wallet/walletIntegrity.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const bookingWalletReservationCapture_service_1 = require("./bookingWalletReservationCapture.service");
const ledger_service_1 = require("./ledger.service");
const marketplacePricing_service_1 = require("./marketplacePricing.service");
const isTransientTransactionError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate.errorLabels?.includes("TransientTransactionError") === true;
};
class BookingCreatorSettlementService {
    fail(message, code, cause) {
        throw new BookingCreatorSettlementError_1.BookingCreatorSettlementError(message, code, { cause });
    }
    pricingSnapshot(booking) {
        try {
            const snapshot = {
                serviceAmount: booking.serviceAmount,
                platformFeeAmount: booking.platformFeeAmount,
                commissionAmount: booking.commissionAmount,
                creatorAmount: booking.creatorAmount,
                totalAmount: booking.totalAmount,
                currency: booking.currency,
            };
            marketplacePricing_service_1.marketplacePricingService.validate(snapshot);
            if (booking.price !== snapshot.serviceAmount) {
                throw new Error("Creator-facing price conflicts with service amount.");
            }
            return snapshot;
        }
        catch (error) {
            this.fail("Booking pricing snapshot cannot be settled safely.", "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT", error);
        }
    }
    async loadCore(bookingId, session) {
        const booking = await booking_repository_1.bookingRepository.findById(bookingId, session);
        if (!booking) {
            this.fail("Booking not found.", "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND");
        }
        if (!booking.paymentId) {
            this.fail("Payment not found.", "BOOKING_CREATOR_SETTLEMENT_PAYMENT_NOT_FOUND");
        }
        const [payment, reservation, allocation] = await Promise.all([
            payment_repository_1.paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(bookingId, session),
            bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.findByBookingAuthoritative(bookingId, session),
        ]);
        if (!payment) {
            this.fail("Payment not found.", "BOOKING_CREATOR_SETTLEMENT_PAYMENT_NOT_FOUND");
        }
        if (!reservation) {
            this.fail("Reservation not found.", "BOOKING_CREATOR_SETTLEMENT_RESERVATION_NOT_FOUND");
        }
        if (!allocation) {
            this.fail("Escrow allocation not found.", "BOOKING_CREATOR_SETTLEMENT_ALLOCATION_NOT_FOUND");
        }
        return { booking, payment, reservation, allocation };
    }
    async loadGraph(bookingId, session) {
        const core = await this.loadCore(bookingId, session);
        const creator = await creatorProfile_model_1.CreatorProfile.findOne({
            userId: core.booking.creatorId,
        }).session(session ?? null).exec();
        if (!creator) {
            this.fail("Creator profile not found.", "BOOKING_CREATOR_SETTLEMENT_CREATOR_NOT_FOUND");
        }
        const creatorUser = await User_1.default.findById(creator.userId)
            .session(session ?? null).exec();
        if (!creatorUser) {
            this.fail("Creator User not found.", "BOOKING_CREATOR_SETTLEMENT_CREATOR_NOT_FOUND");
        }
        const creatorWallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(creator.userId, core.allocation.currency, session);
        if (!creatorWallet) {
            const otherWallet = await wallet_repository_1.walletRepository.findAnyByUser(creator.userId, session);
            if (otherWallet) {
                this.fail("Creator Wallet currency does not match the allocation.", "BOOKING_CREATOR_SETTLEMENT_CURRENCY_CONFLICT");
            }
            this.fail("Creator Wallet not found.", "BOOKING_CREATOR_SETTLEMENT_WALLET_NOT_FOUND");
        }
        return { ...core, creator, creatorUser, creatorWallet };
    }
    async validateBaseGraph(graph, session) {
        const { booking, payment, reservation, allocation, creator, creatorUser, creatorWallet, } = graph;
        if (booking.status !== "COMPLETED") {
            this.fail("Booking is not completed.", "BOOKING_CREATOR_SETTLEMENT_INVALID_BOOKING_STATUS");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED) {
            this.fail("Payment is not captured.", "BOOKING_CREATOR_SETTLEMENT_INVALID_PAYMENT_STATUS");
        }
        if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
            this.fail("Reservation is not captured.", "BOOKING_CREATOR_SETTLEMENT_INVALID_RESERVATION_STATUS");
        }
        if (allocation.status !== bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED ||
            !allocation.allocatedAt) {
            this.fail("Escrow allocation is not allocated.", "BOOKING_CREATOR_SETTLEMENT_INVALID_ALLOCATION_STATUS");
        }
        if (booking.isFinancialLocked) {
            this.fail("Booking is financially locked.", "BOOKING_CREATOR_SETTLEMENT_FINANCIAL_LOCKED");
        }
        if (await dispute_model_1.Dispute.exists({
            bookingId: booking._id,
            status: "OPEN",
        }).session(session ?? null)) {
            this.fail("An OPEN dispute blocks Creator settlement.", "BOOKING_CREATOR_SETTLEMENT_DISPUTE_OPEN");
        }
        if (booking.paymentMethod !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            payment.method !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            payment.bookingId.toString() !== booking._id.toString() ||
            reservation.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentId.toString() !== payment._id.toString() ||
            payment.userId.toString() !== booking.userId.toString() ||
            reservation.userId.toString() !== booking.userId.toString() ||
            payment.creatorId.toString() !== booking.creatorId.toString() ||
            reservation.creatorId.toString() !== booking.creatorId.toString() ||
            allocation.customerId.toString() !== booking.userId.toString() ||
            allocation.creatorId.toString() !== booking.creatorId.toString() ||
            creator.userId.toString() !== booking.creatorId.toString() ||
            creatorUser._id.toString() !== creator.userId.toString() ||
            creatorWallet.userId.toString() !== creator.userId.toString()) {
            this.fail("Creator settlement identity graph conflicts.", "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT");
        }
        if (payment.amount !== booking.totalAmount ||
            payment.serviceAmount !== booking.serviceAmount ||
            payment.customerFeeAmount !== booking.platformFeeAmount ||
            payment.grossEscrowAmount !== booking.totalAmount ||
            reservation.amount !== booking.totalAmount ||
            allocation.bookingAmount !== booking.totalAmount ||
            allocation.serviceAmount !== booking.serviceAmount ||
            allocation.platformFeeAmount !== booking.platformFeeAmount ||
            allocation.totalAmount !== booking.totalAmount) {
            this.fail("Creator settlement amount conflicts.", "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT");
        }
        if (payment.currency !== booking.currency ||
            reservation.currency !== booking.currency ||
            allocation.currency !== booking.currency ||
            creatorWallet.currency !== booking.currency) {
            this.fail("Creator settlement currency conflicts.", "BOOKING_CREATOR_SETTLEMENT_CURRENCY_CONFLICT");
        }
        if (!walletIntegrity_service_1.walletIntegrityService.validateWallet(creatorWallet)) {
            this.fail("Creator Wallet integrity is invalid.", "BOOKING_CREATOR_SETTLEMENT_WALLET_OWNERSHIP_CONFLICT");
        }
        if (booking.settlementId ||
            payment.settlementId ||
            await settlement_model_1.Settlement.exists({
                $or: [{ bookingId: booking._id }, { paymentId: payment._id }],
            }).session(session ?? null) ||
            await refund_model_1.Refund.exists({ paymentId: payment._id }).session(session ?? null) ||
            await ledgerEntry_repository_1.ledgerEntryRepository.exists({
                bookingId: booking._id,
                type: { $in: [ledgerEntryType_enum_1.LedgerEntryType.REFUND, ledgerEntryType_enum_1.LedgerEntryType.REVERSAL] },
            }, session)) {
            this.fail("Post-capture settlement or reversal metadata conflicts.", "BOOKING_CREATOR_SETTLEMENT_COMPLETION_CONFLICT");
        }
        if (!booking.completionCause) {
            this.fail("Booking capture identity is incomplete.", "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT");
        }
        try {
            await bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.validateReplay({
                bookingId: booking._id,
                cause: booking.completionCause,
                session,
            });
        }
        catch (error) {
            this.fail("Captured Booking graph is not authoritative.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR", error);
        }
        const amounts = this.pricingSnapshot(booking);
        if (allocation.commissionRateBps !== marketplacePricing_service_1.CREATOR_COMMISSION_RATE_BPS ||
            allocation.commissionAmount !== amounts.commissionAmount) {
            this.fail("Escrow allocation commission conflicts.", "BOOKING_CREATOR_SETTLEMENT_COMMISSION_CONFLICT");
        }
        if (allocation.creatorAmount !== amounts.creatorAmount ||
            allocation.creatorAmount < 1 ||
            !Number.isSafeInteger(allocation.creatorAmount)) {
            this.fail("Escrow allocation Creator amount conflicts.", "BOOKING_CREATOR_SETTLEMENT_AMOUNT_CONFLICT");
        }
        if (!booking.bookingReference ||
            !reservation.captureTransactionId) {
            this.fail("Escrow allocation identity is incomplete.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
        }
        const allocationIdentity = (0, bookingEscrowAllocationIdentity_util_1.deriveBookingEscrowAllocationIdentity)({
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            paymentId: payment._id,
            paymentReference: payment.paymentReference,
            reservationId: reservation._id,
            reservationReference: reservation.reservationReference,
            customerId: booking.userId,
            creatorId: booking.creatorId,
            bookingAmount: booking.totalAmount,
            serviceAmount: booking.serviceAmount,
            platformFeeAmount: booking.platformFeeAmount,
            totalAmount: booking.totalAmount,
            currency: booking.currency,
            commissionRateBps: marketplacePricing_service_1.CREATOR_COMMISSION_RATE_BPS,
            commissionAmount: amounts.commissionAmount,
            creatorAmount: amounts.creatorAmount,
            captureTransactionId: reservation.captureTransactionId,
        });
        if (allocation.allocationKey !== allocationIdentity.allocationKey ||
            allocation.allocationReference !== allocationIdentity.allocationReference ||
            allocation.paymentId.toString() !== payment._id.toString() ||
            allocation.reservationId.toString() !== reservation._id.toString() ||
            allocation.escrowLedgerTransaction !== reservation.captureTransactionId ||
            allocation.allocationLedgerTransaction !==
                allocationIdentity.allocationLedgerTransaction ||
            allocation.allocationFingerprint !==
                allocationIdentity.allocationFingerprint ||
            allocation.allocationLedgerEntryIds.length !== 4) {
            this.fail("Escrow allocation authority conflicts.", "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT");
        }
        const allocationEntries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: allocation.allocationLedgerTransaction,
        }, session);
        const allocationEntryIds = new Set(allocation.allocationLedgerEntryIds.map(String));
        const commonAllocationValid = allocationEntries.length === 4 &&
            allocationEntries.every((entry) => allocationEntryIds.has(entry._id.toString()) &&
                entry.bookingId?.toString() === booking._id.toString() &&
                entry.paymentId?.toString() === payment._id.toString() &&
                entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
                entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION &&
                entry.currency === booking.currency &&
                !entry.walletId &&
                entry.metadata?.allocationReference === allocation.allocationReference);
        const escrowDebit = allocationEntries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.amount === booking.totalAmount &&
            entry.userId?.toString() === booking.userId.toString() &&
            entry.postingKey === allocationIdentity.escrowDebitPostingKey);
        const commissionCredit = allocationEntries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.commissionAmount &&
            !entry.userId &&
            entry.postingKey === allocationIdentity.commissionCreditPostingKey);
        const creatorCredit = allocationEntries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.creatorAmount &&
            entry.userId?.toString() === booking.creatorId.toString() &&
            entry.postingKey === allocationIdentity.creatorCreditPostingKey);
        const platformFeeCredit = allocationEntries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.platformFeeAmount &&
            !entry.userId &&
            entry.postingKey === allocationIdentity.platformFeeCreditPostingKey);
        if (!commonAllocationValid ||
            !escrowDebit ||
            !commissionCredit ||
            !platformFeeCredit ||
            !creatorCredit) {
            this.fail("Escrow allocation Ledger graph conflicts.", "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT");
        }
        const allocationAuditCount = await auditLog_model_1.AuditLog.countDocuments({
            action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
            entityId: allocation._id,
            "financialContext.primaryReference": allocation.allocationReference,
        }).session(session ?? null);
        if (allocationAuditCount !== 1) {
            this.fail("Escrow allocation audit authority conflicts.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
        }
    }
    identity(graph) {
        const { booking, payment, reservation, allocation, creator, creatorWallet } = graph;
        if (!booking.bookingReference ||
            !reservation.captureTransactionId ||
            !allocation.allocationLedgerTransaction) {
            this.fail("Creator settlement identity is incomplete.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
        }
        return (0, bookingCreatorSettlementIdentity_util_1.deriveBookingCreatorSettlementIdentity)({
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
            creatorWalletId: creatorWallet._id,
            bookingAmount: allocation.bookingAmount,
            currency: allocation.currency,
            commissionAmount: allocation.commissionAmount,
            creatorAmount: allocation.creatorAmount,
            captureTransactionId: reservation.captureTransactionId,
            allocationTransactionId: allocation.allocationLedgerTransaction,
        });
    }
    projectionFingerprint(graph, operationKey, ledgerEntryIds) {
        const normalizedIds = ledgerEntryIds.slice()
            .sort((a, b) => a.toString().localeCompare(b.toString()));
        const canonical = [
            graph.creator.userId.toString(),
            graph.allocation.currency,
            operationKey,
            graph.allocation.creatorAmount,
            0,
            0,
            0,
            0,
            0,
            normalizedIds.map(String).join(","),
        ].join("|");
        return node_crypto_1.default.createHash("sha256").update(canonical).digest("hex");
    }
    safe(graph, settlement, replay) {
        if (settlement.status !== bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED ||
            !settlement.settledAt ||
            !graph.booking.bookingReference) {
            this.fail("Creator settlement result is incomplete.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
        }
        return {
            booking: {
                bookingReference: graph.booking.bookingReference,
                status: "COMPLETED",
            },
            payment: {
                paymentReference: graph.payment.paymentReference,
                status: paymentStatus_enum_1.PaymentStatus.CAPTURED,
            },
            reservation: {
                reservationReference: graph.reservation.reservationReference,
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
            },
            allocation: {
                allocationReference: graph.allocation.allocationReference,
                status: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED,
            },
            creator: { reference: graph.creator.slug },
            settlement: {
                settlementReference: settlement.settlementReference,
                status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
                serviceAmount: graph.allocation.serviceAmount,
                platformFeeAmount: graph.allocation.platformFeeAmount,
                totalAmount: graph.allocation.totalAmount,
                commissionAmount: graph.allocation.commissionAmount,
                creatorAmount: settlement.creatorAmount,
                currency: settlement.currency,
                settledAt: settlement.settledAt,
            },
            wallet: {
                currency: graph.creatorWallet.currency,
                availableBalance: graph.creatorWallet.availableBalance,
                reservedBalance: graph.creatorWallet.reservedBalance,
                lockedBalance: graph.creatorWallet.lockedBalance,
                currentBalance: graph.creatorWallet.currentBalance,
            },
            replay,
        };
    }
    async validateSettledGraph(graph, settlement, session) {
        await this.validateBaseGraph(graph, session);
        const identity = this.identity(graph);
        const { booking, payment, reservation, allocation, creator, creatorWallet, } = graph;
        if (settlement.status !== bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED ||
            !settlement.settledAt ||
            settlement.settlementKey !== identity.settlementKey ||
            settlement.settlementReference !== identity.settlementReference ||
            settlement.bookingId.toString() !== booking._id.toString() ||
            settlement.paymentId.toString() !== payment._id.toString() ||
            settlement.reservationId.toString() !== reservation._id.toString() ||
            settlement.allocationId.toString() !== allocation._id.toString() ||
            settlement.customerUserId.toString() !== booking.userId.toString() ||
            settlement.creatorId.toString() !== creator._id.toString() ||
            settlement.creatorUserId.toString() !== creator.userId.toString() ||
            settlement.creatorWalletId.toString() !== creatorWallet._id.toString() ||
            settlement.bookingAmount !== allocation.bookingAmount ||
            settlement.currency !== allocation.currency ||
            settlement.commissionAmount !== allocation.commissionAmount ||
            settlement.creatorAmount !== allocation.creatorAmount ||
            settlement.captureTransactionId !== reservation.captureTransactionId ||
            settlement.allocationTransactionId !==
                allocation.allocationLedgerTransaction ||
            settlement.settlementTransactionId !==
                identity.settlementTransactionId ||
            settlement.settlementFingerprint !== identity.settlementFingerprint ||
            settlement.settlementProjectionOperationReference !==
                identity.settlementProjectionOperationReference ||
            settlement.settlementLedgerEntryIds.length !== 2) {
            this.fail("Creator settlement authority conflicts.", "BOOKING_CREATOR_SETTLEMENT_IDENTITY_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.settlementTransactionId,
        }, session);
        const allocationSettlementEntries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            "metadata.allocationReference": allocation.allocationReference,
        }, session);
        const expectedIds = new Set(settlement.settlementLedgerEntryIds.map(String));
        const commonValid = entries.length === 2 && entries.every((entry) => expectedIds.has(entry._id.toString()) &&
            entry.bookingId?.toString() === booking._id.toString() &&
            entry.paymentId?.toString() === payment._id.toString() &&
            entry.settlementId?.toString() === settlement._id.toString() &&
            entry.userId?.toString() === creator.userId.toString() &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_CREATOR_SETTLED &&
            entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT &&
            entry.currency === allocation.currency &&
            entry.amount === allocation.creatorAmount &&
            entry.metadata?.reservationReference === reservation.reservationReference &&
            entry.metadata?.allocationReference === allocation.allocationReference &&
            entry.metadata?.settlementReference === settlement.settlementReference &&
            entry.metadata?.creatorId === creator._id.toString() &&
            entry.metadata?.creatorUserId === creator.userId.toString() &&
            entry.metadata?.creatorWalletId === creatorWallet._id.toString());
        const payableDebit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            !entry.walletId &&
            entry.postingKey === identity.creatorPayableDebitPostingKey);
        const walletCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.walletId?.toString() === creatorWallet._id.toString() &&
            entry.postingKey === identity.walletAvailableCreditPostingKey);
        const debitTotal = entries
            .filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
            .reduce((sum, entry) => sum + entry.amount, 0);
        const creditTotal = entries
            .filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
            .reduce((sum, entry) => sum + entry.amount, 0);
        if (!commonValid ||
            allocationSettlementEntries.length !== 2 ||
            !allocationSettlementEntries.every((entry) => expectedIds.has(entry._id.toString())) ||
            !payableDebit ||
            !walletCredit ||
            debitTotal !== allocation.creatorAmount ||
            creditTotal !== allocation.creatorAmount) {
            this.fail("Creator settlement Ledger transaction conflicts.", "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT");
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
        const expectedProjectionFingerprint = this.projectionFingerprint(graph, identity.projectionOperationKey, settlement.settlementLedgerEntryIds);
        if (!projection ||
            projection.operationReference !==
                identity.settlementProjectionOperationReference ||
            projection.walletId.toString() !== creatorWallet._id.toString() ||
            projection.userId.toString() !== creator.userId.toString() ||
            projection.currency !== allocation.currency ||
            projection.operationKey !== identity.projectionOperationKey ||
            projection.fingerprint !== expectedProjectionFingerprint ||
            projection.deltas.availableBalance !== allocation.creatorAmount ||
            projection.deltas.reservedBalance !== 0 ||
            projection.deltas.lockedBalance !== 0 ||
            projection.ledgerEntryIds.length !== 2 ||
            new Set(projection.ledgerEntryIds.map(String)).size !== 2 ||
            !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString())) ||
            creatorWallet.projectionVersion < projection.projectionVersion) {
            this.fail("Creator Wallet projection conflicts.", "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT");
        }
        const auditCount = await auditLog_model_1.AuditLog.countDocuments({
            action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
            entityId: settlement._id,
            "financialContext.primaryReference": settlement.settlementReference,
        }).session(session ?? null);
        if (auditCount !== 1) {
            this.fail("Creator settlement audit authority conflicts.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
        }
        return this.safe(graph, settlement, true);
    }
    async validateReplay(bookingId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            this.fail("Booking not found.", "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND");
        }
        const id = new mongoose_1.Types.ObjectId(bookingId);
        const graph = await this.loadGraph(id);
        const settlement = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findByBooking(id);
        if (!settlement) {
            this.fail("Creator settlement does not exist.", "BOOKING_CREATOR_SETTLEMENT_COMPLETION_CONFLICT");
        }
        return this.validateSettledGraph(graph, settlement);
    }
    async settle(bookingId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            this.fail("Booking not found.", "BOOKING_CREATOR_SETTLEMENT_BOOKING_NOT_FOUND");
        }
        const id = new mongoose_1.Types.ObjectId(bookingId);
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const graph = await this.loadGraph(id, session);
                await this.validateBaseGraph(graph, session);
                const identity = this.identity(graph);
                const [existingByAllocation, existingByKey, existingByBooking, existingEntries, conflictingSettlementEntries, existingProjection,] = await Promise.all([
                    bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findByAllocation(graph.allocation._id, session),
                    bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findBySettlementKey(identity.settlementKey, session),
                    bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findByBooking(id, session),
                    ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                        transactionId: identity.settlementTransactionId,
                    }, session),
                    ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                        source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
                        $or: [
                            { bookingId: graph.booking._id },
                            {
                                "metadata.allocationReference": graph.allocation.allocationReference,
                            },
                        ],
                    }, session),
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session),
                ]);
                const existing = existingByAllocation ?? existingByKey ?? existingByBooking;
                if (existing) {
                    result = await this.validateSettledGraph(graph, existing, session);
                    return;
                }
                if (existingEntries.length ||
                    conflictingSettlementEntries.length ||
                    existingProjection) {
                    this.fail("Partial Creator settlement authority already exists.", "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
                }
                const settlement = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.createPending({
                    settlementReference: identity.settlementReference,
                    settlementKey: identity.settlementKey,
                    bookingId: graph.booking._id,
                    paymentId: graph.payment._id,
                    reservationId: graph.reservation._id,
                    allocationId: graph.allocation._id,
                    customerUserId: graph.booking.userId,
                    creatorId: graph.creator._id,
                    creatorUserId: graph.creator.userId,
                    creatorWalletId: graph.creatorWallet._id,
                    bookingAmount: graph.allocation.bookingAmount,
                    currency: graph.allocation.currency,
                    commissionAmount: graph.allocation.commissionAmount,
                    creatorAmount: graph.allocation.creatorAmount,
                    captureTransactionId: graph.reservation.captureTransactionId,
                    allocationTransactionId: graph.allocation.allocationLedgerTransaction,
                    settlementTransactionId: identity.settlementTransactionId,
                    settlementFingerprint: identity.settlementFingerprint,
                    settlementProjectionOperationReference: identity.settlementProjectionOperationReference,
                }, session);
                let creatorPayableDebit;
                let walletAvailableCredit;
                try {
                    const common = {
                        type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_CREATOR_SETTLED,
                        source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
                        transactionId: identity.settlementTransactionId,
                        bookingId: graph.booking._id.toString(),
                        paymentId: graph.payment._id.toString(),
                        settlementId: settlement._id.toString(),
                        userId: graph.creator.userId.toString(),
                        idempotencyKey: identity.settlementTransactionId,
                        money: {
                            amount: graph.allocation.creatorAmount,
                            currency: graph.allocation.currency,
                        },
                        metadata: {
                            reservationReference: graph.reservation.reservationReference,
                            allocationReference: graph.allocation.allocationReference,
                            settlementReference: identity.settlementReference,
                            captureTransactionId: graph.reservation.captureTransactionId,
                            allocationTransactionId: graph.allocation.allocationLedgerTransaction,
                            customerUserId: graph.booking.userId.toString(),
                            creatorId: graph.creator._id.toString(),
                            creatorUserId: graph.creator.userId.toString(),
                            creatorWalletId: graph.creatorWallet._id.toString(),
                        },
                    };
                    creatorPayableDebit = await ledger_service_1.ledgerService.createDebit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE,
                        postingKey: identity.creatorPayableDebitPostingKey,
                        description: "Allocated Creator payable settled to Wallet",
                    }, session);
                    walletAvailableCredit = await ledger_service_1.ledgerService.createCredit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
                        walletId: graph.creatorWallet._id.toString(),
                        postingKey: identity.walletAvailableCreditPostingKey,
                        description: "Creator Wallet available balance credited",
                    }, session);
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    this.fail("Ledger could not record Creator settlement.", "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT", error);
                }
                const ledgerEntryIds = [
                    creatorPayableDebit._id,
                    walletAvailableCredit._id,
                ];
                try {
                    const wallet = await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                        userId: graph.creator.userId,
                        currency: graph.allocation.currency,
                        operationKey: identity.projectionOperationKey,
                        deltas: {
                            availableBalance: graph.allocation.creatorAmount,
                            reservedBalance: 0,
                            lockedBalance: 0,
                        },
                        ledgerEntryIds,
                    }, session);
                    if (wallet._id.toString() !== graph.creatorWallet._id.toString() ||
                        wallet.userId.toString() !== graph.creator.userId.toString() ||
                        wallet.currency !== graph.allocation.currency) {
                        this.fail("Wallet projection resolved a conflicting Creator Wallet.", "BOOKING_CREATOR_SETTLEMENT_WALLET_OWNERSHIP_CONFLICT");
                    }
                    graph.creatorWallet = wallet;
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    if (error instanceof BookingCreatorSettlementError_1.BookingCreatorSettlementError)
                        throw error;
                    const code = error instanceof WalletError_1.WalletError && error.code === "WALLET_NOT_FOUND"
                        ? "BOOKING_CREATOR_SETTLEMENT_WALLET_NOT_FOUND"
                        : "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT";
                    this.fail("Creator Wallet projection could not be applied.", code, error);
                }
                const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
                if (!projection ||
                    projection.operationReference !==
                        identity.settlementProjectionOperationReference) {
                    this.fail("Creator Wallet projection authority is missing.", "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT");
                }
                const settledAt = new Date();
                const settled = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.guardPendingToSettled({
                    settlementId: settlement._id,
                    settlementKey: identity.settlementKey,
                    allocationId: graph.allocation._id,
                    creatorUserId: graph.creator.userId,
                    creatorWalletId: graph.creatorWallet._id,
                    creatorAmount: graph.allocation.creatorAmount,
                    currency: graph.allocation.currency,
                    settlementTransactionId: identity.settlementTransactionId,
                    settlementProjectionOperationReference: identity.settlementProjectionOperationReference,
                    settlementFingerprint: identity.settlementFingerprint,
                    settlementLedgerEntryIds: ledgerEntryIds,
                    settledAt,
                    expectedVersion: settlement.version,
                }, session);
                if (!settled) {
                    this.fail("Creator settlement transition conflicted.", "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT");
                }
                try {
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                        actor: {
                            type: "SYSTEM",
                            reference: "booking-creator-wallet-settlement",
                        },
                        entityType: "BOOKING_CREATOR_SETTLEMENT",
                        entityId: settled._id,
                        financialContext: {
                            domain: "BOOKING_WALLET",
                            primaryReference: identity.settlementReference,
                            bookingReference: graph.booking.bookingReference,
                            paymentReference: graph.payment.paymentReference,
                            settlementReference: identity.settlementReference,
                            amount: graph.allocation.creatorAmount,
                            currency: graph.allocation.currency,
                            ledgerTransactionReference: identity.settlementTransactionId,
                            projectionOperationReference: identity.settlementProjectionOperationReference,
                        },
                        transition: {
                            fromStatus: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
                            toStatus: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
                            outcome: "SUCCEEDED",
                        },
                        metadata: {
                            classification: "CREATOR_PAYABLE_WALLET_SETTLEMENT",
                            reservationReference: graph.reservation.reservationReference,
                            allocationReference: graph.allocation.allocationReference,
                            creatorAmount: graph.allocation.creatorAmount,
                            creatorId: graph.creator._id.toString(),
                            creatorUserId: graph.creator.userId.toString(),
                            creatorWalletId: graph.creatorWallet._id.toString(),
                        },
                        session,
                    });
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    this.fail("Creator settlement audit could not be persisted.", "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT", error);
                }
                result = this.safe(graph, settled, false);
            });
            if (!result) {
                this.fail("Creator settlement transaction returned no result.", "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT");
            }
            return result;
        }
        catch (error) {
            const winner = await bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.findSettledAuthoritative(id);
            if (winner) {
                const graph = await this.loadGraph(id);
                return this.validateSettledGraph(graph, winner);
            }
            if (error instanceof BookingCreatorSettlementError_1.BookingCreatorSettlementError)
                throw error;
            this.fail("Creator settlement transaction conflicted.", "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.BookingCreatorSettlementService = BookingCreatorSettlementService;
exports.bookingCreatorSettlementService = new BookingCreatorSettlementService();
