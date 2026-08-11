"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingWalletReservationCaptureService = exports.BookingWalletReservationCaptureService = void 0;
const bookingWalletCaptureCause_enum_1 = require("../../enums/financial/bookingWalletCaptureCause.enum");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingWalletReservationCaptureError_1 = require("../../errors/financial/BookingWalletReservationCaptureError");
const WalletError_1 = require("../../errors/financial/WalletError");
const dispute_model_1 = require("../../models/dispute.model");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const booking_repository_1 = require("../../repositories/booking.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const bookingWalletCaptureIdentity_util_1 = require("../../utils/financial/bookingWalletCaptureIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const ledger_service_1 = require("./ledger.service");
const isTransientTransactionError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate.errorLabels?.includes("TransientTransactionError") === true;
};
class BookingWalletReservationCaptureService {
    fail(message, code, cause) {
        throw new BookingWalletReservationCaptureError_1.BookingWalletReservationCaptureError(message, code, { cause });
    }
    validateCause(graph, cause) {
        const { booking } = graph;
        if (booking.status !== "COMPLETED" || !booking.completedAt) {
            this.fail("Only a legitimately completed Booking may capture Wallet funds.", "BOOKING_WALLET_CAPTURE_INVALID_BOOKING_STATUS");
        }
        if (booking.completionCause !== cause) {
            this.fail("Persisted completion cause conflicts with Wallet capture.", "BOOKING_WALLET_CAPTURE_CAUSE_CONFLICT");
        }
        if ((cause === bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.CREATOR_COMPLETED &&
            booking.completedByType !== bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR) ||
            (cause === bookingWalletCaptureCause_enum_1.BookingWalletCaptureCause.AUTO_COMPLETED &&
                booking.completedByType !== bookingWalletCaptureCause_enum_1.BookingCompletionActorType.SYSTEM)) {
            this.fail("Persisted completion actor conflicts with Wallet capture.", "BOOKING_WALLET_CAPTURE_CAUSE_CONFLICT");
        }
        if (booking.paymentStatus !== "PAID" ||
            booking.isPayable ||
            booking.isPayoutEligible ||
            booking.isFinancialLocked ||
            booking.creatorEarningSnapshot !== undefined ||
            booking.platformCommissionSnapshot !== undefined) {
            this.fail("Completed Booking financial fields are inconsistent.", booking.isFinancialLocked
                ? "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED"
                : "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
        }
    }
    validateIdentity(graph) {
        const { booking, payment, reservation } = graph;
        if (booking.paymentMethod !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            payment.method !== paymentMethod_enum_1.PaymentMethod.WALLET) {
            this.fail("Booking Payment method is not Wallet.", "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT");
        }
        if (reservation.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentId.toString() !== payment._id.toString() ||
            payment.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentReference !== payment.paymentReference ||
            booking.paymentReference !== payment.paymentReference ||
            booking.reservationReference !== reservation.reservationReference) {
            this.fail("Booking, Payment, and reservation links are inconsistent.", "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT");
        }
        if (reservation.userId.toString() !== booking.userId.toString() ||
            payment.userId.toString() !== booking.userId.toString() ||
            reservation.creatorId.toString() !== booking.creatorId.toString() ||
            payment.creatorId.toString() !== booking.creatorId.toString() ||
            reservation.serviceId.toString() !== booking.serviceId.toString()) {
            this.fail("Capture participant identity is inconsistent.", "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT");
        }
        if (!payment.walletId ||
            !payment.reservationId ||
            payment.walletId.toString() !== reservation.walletId.toString() ||
            payment.reservationId.toString() !== reservation._id.toString()) {
            this.fail("Payment Wallet reservation identity is inconsistent.", "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT");
        }
        if (reservation.amount !== booking.totalAmount ||
            payment.amount !== reservation.amount ||
            payment.authorizedAmount !== reservation.amount) {
            this.fail("Capture amount conflicts with authorization.", "BOOKING_WALLET_CAPTURE_AMOUNT_CONFLICT");
        }
        if (reservation.currency !== booking.currency ||
            payment.currency !== reservation.currency) {
            this.fail("Capture currency conflicts with authorization.", "BOOKING_WALLET_CAPTURE_CURRENCY_CONFLICT");
        }
        if (!reservation.ledgerTransactionId || !reservation.reservationKey) {
            this.fail("Reservation authorization identity is incomplete.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        if (booking.settlementId || payment.settlementId) {
            this.fail("Booking has already entered settlement.", "BOOKING_WALLET_CAPTURE_COMPLETION_CONFLICT");
        }
    }
    async loadGraph(bookingId, session) {
        const booking = await booking_repository_1.bookingRepository.findById(bookingId, session);
        if (!booking) {
            this.fail("Booking not found.", "BOOKING_WALLET_CAPTURE_BOOKING_NOT_FOUND");
        }
        if (!booking.paymentId) {
            this.fail("Booking Payment link is missing.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
        }
        const [payment, reservation] = await Promise.all([
            payment_repository_1.paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(booking._id, session),
        ]);
        if (!payment) {
            this.fail("Payment not found.", "BOOKING_WALLET_CAPTURE_PAYMENT_NOT_FOUND");
        }
        if (!reservation) {
            this.fail("Wallet booking reservation was not found.", "BOOKING_WALLET_CAPTURE_RESERVATION_NOT_FOUND");
        }
        return { booking, payment, reservation };
    }
    identity(graph, cause) {
        const { booking, payment, reservation } = graph;
        if (!booking.bookingReference || !reservation.ledgerTransactionId) {
            this.fail("Wallet capture identity is incomplete.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        return (0, bookingWalletCaptureIdentity_util_1.deriveBookingWalletCaptureIdentity)({
            reservationKey: reservation.reservationKey,
            reservationReference: reservation.reservationReference,
            authorizationTransactionId: reservation.ledgerTransactionId,
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            paymentId: payment._id,
            paymentReference: payment.paymentReference,
            userId: reservation.userId,
            walletId: reservation.walletId,
            creatorId: reservation.creatorId,
            serviceId: reservation.serviceId,
            amount: reservation.amount,
            currency: reservation.currency,
            cause,
        });
    }
    safe(graph, wallet, replay) {
        const { booking, payment, reservation } = graph;
        if (!wallet ||
            !booking.completedAt ||
            !reservation.captureReference ||
            !reservation.captureCause ||
            !reservation.capturedAt) {
            this.fail("Captured Wallet reservation is missing safe result data.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        return {
            booking: {
                bookingReference: booking.bookingReference,
                status: "COMPLETED",
                completedAt: booking.completedAt,
            },
            payment: {
                paymentReference: payment.paymentReference,
                method: paymentMethod_enum_1.PaymentMethod.WALLET,
                status: paymentStatus_enum_1.PaymentStatus.CAPTURED,
                captureReference: reservation.captureReference,
            },
            reservation: {
                reservationReference: reservation.reservationReference,
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
                captureReference: reservation.captureReference,
                captureCause: reservation.captureCause,
                amount: reservation.amount,
                currency: reservation.currency,
                capturedAt: reservation.capturedAt,
            },
            wallet: {
                currency: wallet.currency,
                availableBalance: wallet.availableBalance,
                reservedBalance: wallet.reservedBalance,
                lockedBalance: wallet.lockedBalance,
                currentBalance: wallet.currentBalance,
            },
            replay,
        };
    }
    async validateCapturedGraph(graph, cause, session) {
        const { booking, payment, reservation } = graph;
        this.validateCause(graph, cause);
        this.validateIdentity(graph);
        if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
            this.fail("Reservation is not captured.", "BOOKING_WALLET_CAPTURE_INVALID_RESERVATION_STATUS");
        }
        const identity = this.identity(graph, cause);
        if (reservation.captureCause !== cause ||
            reservation.captureKey !== identity.captureKey ||
            reservation.captureReference !== identity.captureReference ||
            reservation.captureTransactionId !== identity.captureTransactionId ||
            reservation.captureFingerprint !== identity.captureFingerprint ||
            !reservation.capturedAt ||
            reservation.capturedAt.getTime() !== booking.completedAt.getTime() ||
            reservation.capturedByType !== booking.completedByType ||
            (booking.completedByType === bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR &&
                (!reservation.capturedById ||
                    !booking.completedById ||
                    reservation.capturedById.toString() !== booking.completedById.toString())) ||
            !reservation.captureProjectionOperationId ||
            !reservation.captureProjectionOperationReference ||
            reservation.captureLedgerEntryIds.length !== 2) {
            this.fail("Captured reservation identity or links are inconsistent.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED ||
            payment.captureReference !== identity.captureReference ||
            payment.captureCause !== cause ||
            payment.capturedAmount !== reservation.amount ||
            !payment.capturedAt ||
            payment.capturedAt.getTime() !== reservation.capturedAt.getTime() ||
            payment.escrowLedgerTransactionReference !== identity.captureTransactionId ||
            payment.escrowRecognizedAt?.getTime() !== reservation.capturedAt.getTime()) {
            this.fail("Captured Payment state is inconsistent.", "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.captureTransactionId,
        }, session);
        if (entries.length !== 2) {
            this.fail("Capture Ledger transaction is incomplete.", "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
        }
        const expectedLedgerIds = new Set(reservation.captureLedgerEntryIds.map(String));
        const commonValid = entries.every((entry) => expectedLedgerIds.has(entry._id.toString()) &&
            entry.bookingId?.toString() === booking._id.toString() &&
            entry.paymentId?.toString() === payment._id.toString() &&
            entry.userId?.toString() === reservation.userId.toString() &&
            entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_CAPTURED &&
            entry.amount === reservation.amount &&
            entry.currency === reservation.currency &&
            entry.metadata?.reservationReference === reservation.reservationReference &&
            entry.metadata?.captureCause === cause &&
            entry.metadata?.creatorId === reservation.creatorId.toString() &&
            entry.metadata?.serviceId === reservation.serviceId.toString());
        const reservedDebit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.walletId?.toString() === reservation.walletId.toString() &&
            entry.postingKey === identity.reservedPostingKey);
        const clearingCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            !entry.walletId &&
            entry.postingKey === identity.clearingPostingKey);
        if (!commonValid || !reservedDebit || !clearingCredit) {
            this.fail("Capture Ledger does not prove reserved-to-clearing movement.", "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
        const projectionLedgerIds = new Set(projection?.ledgerEntryIds.map(String) ?? []);
        if (!projection ||
            !projection.fingerprint ||
            projection._id.toString() !== reservation.captureProjectionOperationId.toString() ||
            projection.operationReference !== reservation.captureProjectionOperationReference ||
            projection.walletId.toString() !== reservation.walletId.toString() ||
            projection.userId.toString() !== reservation.userId.toString() ||
            projection.currency !== reservation.currency ||
            projection.deltas.availableBalance !== 0 ||
            projection.deltas.reservedBalance !== -reservation.amount ||
            projection.deltas.lockedBalance !== 0 ||
            projectionLedgerIds.size !== 2 ||
            !entries.every((entry) => projectionLedgerIds.has(entry._id.toString()))) {
            this.fail("Capture Wallet projection is inconsistent.", "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT");
        }
        const wallet = await wallet_repository_1.walletRepository.findById(reservation.walletId, session);
        if (!wallet ||
            wallet.userId.toString() !== reservation.userId.toString() ||
            wallet.currency !== reservation.currency ||
            wallet.availableBalance < 0 ||
            wallet.reservedBalance < 0 ||
            wallet.lockedBalance < 0 ||
            wallet.currentBalance !==
                wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
            this.fail("Captured Wallet state is inconsistent.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        return this.safe(graph, wallet, true);
    }
    async validateReplay(input) {
        const graph = await this.loadGraph(input.bookingId, input.session);
        return this.validateCapturedGraph(graph, input.cause, input.session);
    }
    async capture(input) {
        if (!input.session.inTransaction()) {
            this.fail("Wallet capture requires an active transaction.", "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT");
        }
        const graph = await this.loadGraph(input.bookingId, input.session);
        this.validateCause(graph, input.cause);
        this.validateIdentity(graph);
        const { booking, payment, reservation } = graph;
        if (booking.isFinancialLocked) {
            this.fail("Booking is financially locked.", "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED");
        }
        if (await dispute_model_1.Dispute.exists({ bookingId: booking._id, status: "OPEN" }).session(input.session)) {
            this.fail("An OPEN dispute blocks Wallet capture.", "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN");
        }
        if (reservation.status === bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED) {
            this.fail("Released Wallet reservations cannot be captured.", "BOOKING_WALLET_CAPTURE_ALREADY_RELEASED");
        }
        if (reservation.status === bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
            return this.validateCapturedGraph(graph, input.cause, input.session);
        }
        if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE) {
            this.fail("Only ACTIVE Wallet reservations can be captured.", "BOOKING_WALLET_CAPTURE_INVALID_RESERVATION_STATUS");
        }
        if (reservation.captureReference ||
            reservation.captureKey ||
            reservation.captureTransactionId ||
            reservation.captureLedgerEntryIds.length > 0 ||
            reservation.captureProjectionOperationId ||
            reservation.captureProjectionOperationReference ||
            reservation.captureCause ||
            reservation.capturedAt ||
            reservation.captureFingerprint) {
            this.fail("ACTIVE reservation contains partial capture authority.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.AUTHORIZED) {
            this.fail("Wallet Payment is not authorized for capture.", "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS");
        }
        const identity = this.identity(graph, input.cause);
        const [existingEntries, existingProjection, existingCapture] = await Promise.all([
            ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                transactionId: identity.captureTransactionId,
            }, input.session),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, input.session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByCaptureKey(identity.captureKey, input.session),
        ]);
        if (existingEntries.length || existingProjection || existingCapture) {
            this.fail("A partial or conflicting Wallet capture graph already exists.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        let reservedDebit;
        let clearingCredit;
        try {
            const common = {
                type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_CAPTURED,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
                money: { amount: reservation.amount, currency: reservation.currency },
                transactionId: identity.captureTransactionId,
                bookingId: booking._id.toString(),
                paymentId: payment._id.toString(),
                userId: reservation.userId.toString(),
                idempotencyKey: identity.captureTransactionId,
                metadata: {
                    reservationReference: reservation.reservationReference,
                    captureReference: identity.captureReference,
                    captureCause: input.cause,
                    creatorId: reservation.creatorId.toString(),
                    serviceId: reservation.serviceId.toString(),
                },
            };
            reservedDebit = await ledger_service_1.ledgerService.createDebit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED,
                walletId: reservation.walletId.toString(),
                postingKey: identity.reservedPostingKey,
                description: "Booking Wallet reserved funds captured",
            }, input.session);
            clearingCredit = await ledger_service_1.ledgerService.createCredit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
                postingKey: identity.clearingPostingKey,
                description: "Captured booking funds held in platform escrow clearing",
            }, input.session);
        }
        catch (error) {
            if (isTransientTransactionError(error))
                throw error;
            this.fail("Ledger could not record Wallet capture.", "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT", error);
        }
        let wallet;
        try {
            wallet = await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                userId: reservation.userId,
                currency: reservation.currency,
                operationKey: identity.projectionOperationKey,
                deltas: {
                    availableBalance: 0,
                    reservedBalance: -reservation.amount,
                    lockedBalance: 0,
                },
                minimums: { reservedBalance: reservation.amount },
                ledgerEntryIds: [
                    reservedDebit._id,
                    clearingCredit._id,
                ],
            }, input.session);
        }
        catch (error) {
            if (isTransientTransactionError(error))
                throw error;
            if (error instanceof WalletError_1.WalletError && error.code === "WALLET_INSUFFICIENT_BALANCE") {
                this.fail("Wallet reserved balance is below the reservation amount.", "BOOKING_WALLET_CAPTURE_INSUFFICIENT_RESERVED_BALANCE", error);
            }
            this.fail("Wallet projection could not apply capture.", "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT", error);
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, input.session);
        if (!projection) {
            this.fail("Capture projection operation is missing.", "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR");
        }
        const capturedAt = booking.completedAt;
        const captured = await bookingFundReservation_repository_1.bookingFundReservationRepository.guardActiveToCaptured({
            reservationId: reservation._id,
            bookingId: booking._id,
            paymentId: payment._id,
            userId: reservation.userId,
            walletId: reservation.walletId,
            creatorId: reservation.creatorId,
            serviceId: reservation.serviceId,
            amount: reservation.amount,
            currency: reservation.currency,
            captureReference: identity.captureReference,
            captureKey: identity.captureKey,
            captureTransactionId: identity.captureTransactionId,
            captureLedgerEntryIds: [
                reservedDebit._id,
                clearingCredit._id,
            ],
            captureProjectionOperationId: projection._id,
            captureProjectionOperationReference: projection.operationReference,
            captureCause: input.cause,
            capturedAt,
            capturedByType: input.actorType,
            capturedById: input.actorId,
            captureFingerprint: identity.captureFingerprint,
            expectedVersion: reservation.version,
        }, input.session);
        if (!captured) {
            this.fail("Reservation capture transition conflicted.", "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT");
        }
        const capturedPayment = await payment_repository_1.paymentRepository.guardWalletAuthorizedToCaptured({
            paymentId: payment._id,
            bookingId: booking._id,
            reservationId: reservation._id,
            reservationReference: reservation.reservationReference,
            walletId: reservation.walletId,
            amount: reservation.amount,
            currency: reservation.currency,
            captureReference: identity.captureReference,
            captureCause: input.cause,
            captureTransactionId: identity.captureTransactionId,
            capturedAt,
        }, input.session);
        if (!capturedPayment) {
            this.fail("Payment capture transition conflicted.", "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS");
        }
        const auditActor = input.actorType === bookingWalletCaptureCause_enum_1.BookingCompletionActorType.CREATOR
            ? { type: "CREATOR", id: input.actorId }
            : { type: "SYSTEM", reference: "booking-auto-completion" };
        try {
            await (0, auditLog_service_1.createFinancialAudit)({
                action: auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
                actor: auditActor,
                entityType: "BOOKING_FUND_RESERVATION",
                entityId: captured._id,
                financialContext: {
                    domain: "BOOKING_WALLET",
                    primaryReference: identity.captureReference,
                    bookingReference: booking.bookingReference,
                    paymentReference: payment.paymentReference,
                    amount: reservation.amount,
                    currency: reservation.currency,
                    ledgerTransactionReference: identity.captureTransactionId,
                    projectionOperationReference: projection.operationReference,
                },
                transition: {
                    fromStatus: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
                    toStatus: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED,
                    outcome: "SUCCEEDED",
                },
                metadata: { reasonCode: input.cause },
                session: input.session,
            });
        }
        catch (error) {
            if (isTransientTransactionError(error))
                throw error;
            this.fail("Capture audit could not be persisted.", "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT", error);
        }
        return this.safe({
            booking,
            payment: capturedPayment,
            reservation: captured,
        }, wallet, false);
    }
}
exports.BookingWalletReservationCaptureService = BookingWalletReservationCaptureService;
exports.bookingWalletReservationCaptureService = new BookingWalletReservationCaptureService();
