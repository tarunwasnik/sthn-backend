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
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingEscrowAllocationService = exports.BookingEscrowAllocationService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingEscrowAllocationStatus_enum_1 = require("../../enums/financial/bookingEscrowAllocationStatus.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletCaptureCause_enum_1 = require("../../enums/financial/bookingWalletCaptureCause.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingEscrowAllocationError_1 = require("../../errors/financial/BookingEscrowAllocationError");
const auditLog_model_1 = require("../../models/auditLog.model");
const dispute_model_1 = require("../../models/dispute.model");
const settlement_model_1 = require("../../models/settlement.model");
const walletProjectionOperation_model_1 = require("../../models/walletProjectionOperation.model");
const bookingEscrowAllocation_repository_1 = require("../../repositories/bookingEscrowAllocation.repository");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const booking_repository_1 = require("../../repositories/booking.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const bookingEscrowAllocationIdentity_util_1 = require("../../utils/financial/bookingEscrowAllocationIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const marketplacePricing_service_1 = require("./marketplacePricing.service");
const bookingWalletReservationCapture_service_1 = require("./bookingWalletReservationCapture.service");
const ledger_service_1 = require("./ledger.service");
const isTransientTransactionError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate.errorLabels?.includes("TransientTransactionError") === true;
};
class BookingEscrowAllocationService {
    fail(message, code, cause) {
        throw new BookingEscrowAllocationError_1.BookingEscrowAllocationError(message, code, { cause });
    }
    amounts(booking) {
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
            return {
                ...snapshot,
                commissionRateBps: marketplacePricing_service_1.CREATOR_COMMISSION_RATE_BPS,
            };
        }
        catch (error) {
            this.fail("Booking pricing snapshot cannot be allocated safely.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR", error);
        }
    }
    async loadGraph(bookingId, session) {
        const booking = await booking_repository_1.bookingRepository.findById(bookingId, session);
        if (!booking) {
            this.fail("Booking not found.", "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND");
        }
        if (!booking.paymentId) {
            this.fail("Payment not found.", "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND");
        }
        const [payment, reservation] = await Promise.all([
            payment_repository_1.paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(bookingId, session),
        ]);
        if (!payment) {
            this.fail("Payment not found.", "BOOKING_ESCROW_ALLOCATION_PAYMENT_NOT_FOUND");
        }
        if (!reservation) {
            this.fail("Captured reservation not found.", "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND");
        }
        return { booking, payment, reservation };
    }
    async validateCapturedPreconditions(graph, session) {
        const { booking, payment, reservation } = graph;
        if (booking.isFinancialLocked) {
            this.fail("Booking is financially locked.", "BOOKING_ESCROW_ALLOCATION_FINANCIAL_LOCKED");
        }
        if (await dispute_model_1.Dispute.exists({
            bookingId: booking._id,
            status: "OPEN",
        }).session(session ?? null)) {
            this.fail("An OPEN dispute blocks escrow allocation.", "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN");
        }
        if (booking.status !== "COMPLETED" ||
            payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED ||
            reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
            this.fail("Booking capture lifecycle is not eligible for allocation.", "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT");
        }
        if (booking.paymentMethod !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            payment.method !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            !booking.completionCause ||
            !Object.values(bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause).includes(booking.completionCause)) {
            this.fail("Escrow allocation identity requires a Wallet capture.", "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT");
        }
        if (payment.bookingId.toString() !== booking._id.toString() ||
            reservation.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentId.toString() !== payment._id.toString() ||
            reservation.userId.toString() !== booking.userId.toString() ||
            payment.userId.toString() !== booking.userId.toString() ||
            reservation.creatorId.toString() !== booking.creatorId.toString() ||
            payment.creatorId.toString() !== booking.creatorId.toString() ||
            reservation.amount !== booking.totalAmount ||
            payment.amount !== booking.totalAmount ||
            payment.serviceAmount !== booking.serviceAmount ||
            payment.customerFeeAmount !== booking.platformFeeAmount ||
            payment.grossEscrowAmount !== booking.totalAmount ||
            reservation.currency !== booking.currency ||
            payment.currency !== booking.currency ||
            !reservation.captureTransactionId ||
            payment.escrowLedgerTransactionReference !== reservation.captureTransactionId) {
            this.fail("Booking capture identity conflicts with allocation.", "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT");
        }
        if (booking.settlementId ||
            payment.settlementId ||
            await settlement_model_1.Settlement.exists({
                $or: [{ bookingId: booking._id }, { paymentId: payment._id }],
            }).session(session ?? null)) {
            this.fail("A settled Booking cannot be allocated.", "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT");
        }
        try {
            await bookingWalletReservationCapture_service_1.bookingWalletReservationCaptureService.validateReplay({
                bookingId: booking._id,
                cause: booking.completionCause,
                session,
            });
        }
        catch (error) {
            this.fail("Captured Booking graph is not authoritative.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR", error);
        }
    }
    identity(graph, amounts) {
        const { booking, payment, reservation } = graph;
        if (!booking.bookingReference ||
            !reservation.captureTransactionId) {
            this.fail("Allocation identity is incomplete.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
        }
        return (0, bookingEscrowAllocationIdentity_util_1.deriveBookingEscrowAllocationIdentity)({
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            paymentId: payment._id,
            paymentReference: payment.paymentReference,
            reservationId: reservation._id,
            reservationReference: reservation.reservationReference,
            customerId: reservation.userId,
            creatorId: reservation.creatorId,
            bookingAmount: reservation.amount,
            serviceAmount: amounts.serviceAmount,
            platformFeeAmount: amounts.platformFeeAmount,
            totalAmount: amounts.totalAmount,
            currency: reservation.currency,
            commissionRateBps: amounts.commissionRateBps,
            commissionAmount: amounts.commissionAmount,
            creatorAmount: amounts.creatorAmount,
            captureTransactionId: reservation.captureTransactionId,
        });
    }
    safe(graph, allocation, replay) {
        if (allocation.status !== bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED ||
            !allocation.allocatedAt) {
            this.fail("Allocated result is incomplete.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
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
                allocationReference: allocation.allocationReference,
                status: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED,
                bookingAmount: allocation.bookingAmount,
                serviceAmount: allocation.serviceAmount,
                platformFeeAmount: allocation.platformFeeAmount,
                totalAmount: allocation.totalAmount,
                currency: allocation.currency,
                commissionRateBps: allocation.commissionRateBps,
                commissionAmount: allocation.commissionAmount,
                creatorAmount: allocation.creatorAmount,
                allocatedAt: allocation.allocatedAt,
            },
            replay,
        };
    }
    async validateAllocatedGraph(graph, allocation, session) {
        await this.validateCapturedPreconditions(graph, session);
        const amounts = this.amounts(graph.booking);
        const identity = this.identity(graph, amounts);
        if (allocation.status !== bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED ||
            !allocation.allocatedAt ||
            allocation.allocationKey !== identity.allocationKey ||
            allocation.allocationReference !== identity.allocationReference ||
            allocation.bookingId.toString() !== graph.booking._id.toString() ||
            allocation.paymentId.toString() !== graph.payment._id.toString() ||
            allocation.reservationId.toString() !== graph.reservation._id.toString() ||
            allocation.customerId.toString() !== graph.reservation.userId.toString() ||
            allocation.creatorId.toString() !== graph.reservation.creatorId.toString() ||
            allocation.bookingAmount !== graph.reservation.amount ||
            allocation.serviceAmount !== amounts.serviceAmount ||
            allocation.platformFeeAmount !== amounts.platformFeeAmount ||
            allocation.totalAmount !== amounts.totalAmount ||
            allocation.currency !== graph.reservation.currency ||
            allocation.commissionRateBps !== amounts.commissionRateBps ||
            allocation.commissionAmount !== amounts.commissionAmount ||
            allocation.creatorAmount !== amounts.creatorAmount ||
            allocation.escrowLedgerTransaction !== graph.reservation.captureTransactionId ||
            allocation.allocationLedgerTransaction !== identity.allocationLedgerTransaction ||
            allocation.allocationFingerprint !== identity.allocationFingerprint ||
            allocation.allocationLedgerEntryIds.length !== 4) {
            this.fail("Allocated authority conflicts with captured Booking.", "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.allocationLedgerTransaction,
        }, session);
        if (entries.length !== 4) {
            this.fail("Escrow allocation Ledger transaction is incomplete.", "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT");
        }
        const expectedIds = new Set(allocation.allocationLedgerEntryIds.map(String));
        const commonValid = entries.every((entry) => expectedIds.has(entry._id.toString()) &&
            entry.bookingId?.toString() === graph.booking._id.toString() &&
            entry.paymentId?.toString() === graph.payment._id.toString() &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
            entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION &&
            entry.currency === graph.reservation.currency &&
            !entry.walletId &&
            entry.metadata?.reservationReference === graph.reservation.reservationReference &&
            entry.metadata?.allocationReference === identity.allocationReference &&
            entry.metadata?.captureTransactionId === graph.reservation.captureTransactionId &&
            entry.metadata?.customerId === graph.reservation.userId.toString() &&
            entry.metadata?.creatorId === graph.reservation.creatorId.toString());
        const escrowDebit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.amount === graph.reservation.amount &&
            entry.userId?.toString() === graph.reservation.userId.toString() &&
            entry.postingKey === identity.escrowDebitPostingKey);
        const commissionCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.commissionAmount &&
            !entry.userId &&
            entry.postingKey === identity.commissionCreditPostingKey);
        const platformFeeCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.platformFeeAmount &&
            !entry.userId &&
            entry.postingKey === identity.platformFeeCreditPostingKey);
        const creatorCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.amount === amounts.creatorAmount &&
            entry.userId?.toString() === graph.reservation.creatorId.toString() &&
            entry.postingKey === identity.creatorCreditPostingKey);
        const debitTotal = entries
            .filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
            .reduce((sum, entry) => sum + entry.amount, 0);
        const creditTotal = entries
            .filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
            .reduce((sum, entry) => sum + entry.amount, 0);
        if (!commonValid ||
            !escrowDebit ||
            !commissionCredit ||
            !platformFeeCredit ||
            !creatorCredit ||
            debitTotal !== creditTotal ||
            debitTotal !== graph.reservation.amount) {
            this.fail("Escrow allocation Ledger does not balance.", "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT");
        }
        if (await walletProjectionOperation_model_1.WalletProjectionOperation.exists({
            ledgerEntryIds: { $in: entries.map((entry) => entry._id) },
        }).session(session ?? null)) {
            this.fail("Escrow allocation must not have a Wallet projection.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
        }
        const auditCount = await auditLog_model_1.AuditLog.countDocuments({
            action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
            entityId: allocation._id,
            "financialContext.primaryReference": allocation.allocationReference,
        }).session(session ?? null);
        if (auditCount !== 1) {
            this.fail("Escrow allocation audit authority is inconsistent.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
        }
        return this.safe(graph, allocation, true);
    }
    async validateReplay(bookingId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            this.fail("Booking not found.", "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND");
        }
        const id = new mongoose_1.Types.ObjectId(bookingId);
        const [graph, allocation] = await Promise.all([
            this.loadGraph(id),
            bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.findByBookingAuthoritative(id),
        ]);
        if (!allocation) {
            this.fail("Escrow allocation does not exist.", "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT");
        }
        return this.validateAllocatedGraph(graph, allocation);
    }
    async allocate(bookingId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(bookingId)) {
            this.fail("Booking not found.", "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND");
        }
        const id = new mongoose_1.Types.ObjectId(bookingId);
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const graph = await this.loadGraph(id, session);
                await this.validateCapturedPreconditions(graph, session);
                const amounts = this.amounts(graph.booking);
                const identity = this.identity(graph, amounts);
                const [existingByBooking, existingByKey, existingEntries] = await Promise.all([
                    bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.findByBookingAuthoritative(id, session),
                    bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.findByAllocationKey(identity.allocationKey, session),
                    ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                        transactionId: identity.allocationLedgerTransaction,
                    }, session),
                ]);
                const existing = existingByBooking ?? existingByKey;
                if (existing) {
                    result = await this.validateAllocatedGraph(graph, existing, session);
                    return;
                }
                if (existingEntries.length) {
                    this.fail("Partial allocation Ledger authority already exists.", "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
                }
                const allocation = await bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.createPending({
                    allocationReference: identity.allocationReference,
                    allocationKey: identity.allocationKey,
                    bookingId: graph.booking._id,
                    paymentId: graph.payment._id,
                    reservationId: graph.reservation._id,
                    customerId: graph.reservation.userId,
                    creatorId: graph.reservation.creatorId,
                    bookingAmount: graph.reservation.amount,
                    serviceAmount: amounts.serviceAmount,
                    platformFeeAmount: amounts.platformFeeAmount,
                    totalAmount: amounts.totalAmount,
                    currency: graph.reservation.currency,
                    commissionRateBps: amounts.commissionRateBps,
                    commissionAmount: amounts.commissionAmount,
                    creatorAmount: amounts.creatorAmount,
                    escrowLedgerTransaction: graph.reservation.captureTransactionId,
                    allocationLedgerTransaction: identity.allocationLedgerTransaction,
                    allocationFingerprint: identity.allocationFingerprint,
                }, session);
                let escrowDebit;
                let commissionCredit;
                let platformFeeCredit;
                let creatorCredit;
                try {
                    const common = {
                        type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_ESCROW_ALLOCATED,
                        source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
                        transactionId: identity.allocationLedgerTransaction,
                        bookingId: graph.booking._id.toString(),
                        paymentId: graph.payment._id.toString(),
                        idempotencyKey: identity.allocationLedgerTransaction,
                        metadata: {
                            reservationReference: graph.reservation.reservationReference,
                            allocationReference: identity.allocationReference,
                            captureTransactionId: graph.reservation.captureTransactionId,
                            customerId: graph.reservation.userId.toString(),
                            creatorId: graph.reservation.creatorId.toString(),
                            commissionRateBps: amounts.commissionRateBps,
                        },
                    };
                    escrowDebit = await ledger_service_1.ledgerService.createDebit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
                        money: {
                            amount: graph.reservation.amount,
                            currency: graph.reservation.currency,
                        },
                        userId: graph.reservation.userId.toString(),
                        postingKey: identity.escrowDebitPostingKey,
                        description: "Captured booking escrow allocated",
                    }, session);
                    commissionCredit = await ledger_service_1.ledgerService.createCredit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE,
                        money: {
                            amount: amounts.commissionAmount,
                            currency: graph.reservation.currency,
                        },
                        postingKey: identity.commissionCreditPostingKey,
                        description: "Creator commission recognized as platform revenue",
                    }, session);
                    platformFeeCredit = await ledger_service_1.ledgerService.createCredit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE,
                        money: {
                            amount: amounts.platformFeeAmount,
                            currency: graph.reservation.currency,
                        },
                        postingKey: identity.platformFeeCreditPostingKey,
                        description: "Customer platform service fee recognized",
                    }, session);
                    creatorCredit = await ledger_service_1.ledgerService.createCredit({
                        ...common,
                        account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE,
                        money: {
                            amount: amounts.creatorAmount,
                            currency: graph.reservation.currency,
                        },
                        userId: graph.reservation.creatorId.toString(),
                        postingKey: identity.creatorCreditPostingKey,
                        description: "Creator payable allocated",
                    }, session);
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    this.fail("Ledger could not allocate captured escrow.", "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT", error);
                }
                const allocatedAt = new Date();
                const allocated = await bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository
                    .guardPendingToAllocated({
                    allocationId: allocation._id,
                    allocationKey: identity.allocationKey,
                    bookingId: graph.booking._id,
                    paymentId: graph.payment._id,
                    reservationId: graph.reservation._id,
                    customerId: graph.reservation.userId,
                    creatorId: graph.reservation.creatorId,
                    bookingAmount: graph.reservation.amount,
                    serviceAmount: amounts.serviceAmount,
                    platformFeeAmount: amounts.platformFeeAmount,
                    totalAmount: amounts.totalAmount,
                    currency: graph.reservation.currency,
                    commissionRateBps: amounts.commissionRateBps,
                    commissionAmount: amounts.commissionAmount,
                    creatorAmount: amounts.creatorAmount,
                    escrowLedgerTransaction: graph.reservation.captureTransactionId,
                    allocationLedgerTransaction: identity.allocationLedgerTransaction,
                    allocationLedgerEntryIds: [
                        escrowDebit._id,
                        commissionCredit._id,
                        platformFeeCredit._id,
                        creatorCredit._id,
                    ],
                    allocationFingerprint: identity.allocationFingerprint,
                    allocatedAt,
                    expectedVersion: allocation.version,
                }, session);
                if (!allocated) {
                    this.fail("Escrow allocation transition conflicted.", "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT");
                }
                try {
                    await (0, auditLog_service_1.createFinancialAudit)({
                        action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
                        actor: { type: "SYSTEM", reference: "booking-escrow-allocation" },
                        entityType: "BOOKING_ESCROW_ALLOCATION",
                        entityId: allocated._id,
                        financialContext: {
                            domain: "ESCROW",
                            primaryReference: identity.allocationReference,
                            bookingReference: graph.booking.bookingReference,
                            paymentReference: graph.payment.paymentReference,
                            amount: graph.reservation.amount,
                            currency: graph.reservation.currency,
                            ledgerTransactionReference: identity.allocationLedgerTransaction,
                        },
                        transition: {
                            fromStatus: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.PENDING,
                            toStatus: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED,
                            outcome: "SUCCEEDED",
                        },
                        metadata: {
                            classification: "CAPTURED_ESCROW_ALLOCATION",
                            reservationReference: graph.reservation.reservationReference,
                            allocationReference: identity.allocationReference,
                            commissionAmount: amounts.commissionAmount,
                            creatorAmount: amounts.creatorAmount,
                            serviceAmount: amounts.serviceAmount,
                            platformFeeAmount: amounts.platformFeeAmount,
                            totalAmount: amounts.totalAmount,
                            creatorId: graph.reservation.creatorId.toString(),
                        },
                        session,
                    });
                }
                catch (error) {
                    if (isTransientTransactionError(error))
                        throw error;
                    this.fail("Escrow allocation audit could not be persisted.", "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT", error);
                }
                result = this.safe(graph, allocated, false);
            });
            if (!result) {
                this.fail("Escrow allocation transaction returned no result.", "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT");
            }
            return result;
        }
        catch (error) {
            const winner = await bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository
                .findByBookingAuthoritative(id);
            if (winner?.status === bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED) {
                const graph = await this.loadGraph(id);
                return this.validateAllocatedGraph(graph, winner);
            }
            if (error instanceof BookingEscrowAllocationError_1.BookingEscrowAllocationError)
                throw error;
            this.fail("Escrow allocation transaction conflicted.", "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT", error);
        }
        finally {
            await session.endSession();
        }
    }
}
exports.BookingEscrowAllocationService = BookingEscrowAllocationService;
exports.bookingEscrowAllocationService = new BookingEscrowAllocationService();
