"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingWalletReservationReleaseService = exports.BookingWalletReservationReleaseService = exports.bookingWalletReleaseCauseForTermination = void 0;
const bookingTerminationType_enum_1 = require("../../enums/booking/bookingTerminationType.enum");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletReleaseCause_enum_1 = require("../../enums/financial/bookingWalletReleaseCause.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingWalletReservationReleaseError_1 = require("../../errors/financial/BookingWalletReservationReleaseError");
const WalletError_1 = require("../../errors/financial/WalletError");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const booking_repository_1 = require("../../repositories/booking.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const bookingWalletReleaseIdentity_util_1 = require("../../utils/financial/bookingWalletReleaseIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const ledger_service_1 = require("./ledger.service");
const TERMINATION_CAUSES = new Map([
    [bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED],
    [bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.REQUEST_EXPIRED],
    [bookingTerminationType_enum_1.BookingTerminationType.CUSTOMER_CANCELLED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.USER_CANCELLED],
    [bookingTerminationType_enum_1.BookingTerminationType.CREATOR_CANCELLED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_CANCELLED],
    [bookingTerminationType_enum_1.BookingTerminationType.ADMIN_CANCELLED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.ADMIN_CANCELLED],
    [bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.GOVERNANCE_TERMINATED],
]);
const bookingWalletReleaseCauseForTermination = (terminationType) => TERMINATION_CAUSES.get(terminationType) ?? null;
exports.bookingWalletReleaseCauseForTermination = bookingWalletReleaseCauseForTermination;
const expectedBookingStatus = (cause) => {
    if (cause === bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED)
        return "REJECTED";
    if (cause === bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.REQUEST_EXPIRED)
        return "EXPIRED";
    return "CANCELLED";
};
const targetPaymentStatus = (cause) => cause === bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.REQUEST_EXPIRED
    ? paymentStatus_enum_1.PaymentStatus.EXPIRED
    : paymentStatus_enum_1.PaymentStatus.CANCELLED;
const isTransientTransactionError = (error) => {
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate.errorLabels?.includes("TransientTransactionError") === true;
};
class BookingWalletReservationReleaseService {
    fail(message, code, cause) {
        throw new BookingWalletReservationReleaseError_1.BookingWalletReservationReleaseError(message, code, { cause });
    }
    validateCause(booking, cause) {
        if (booking.status !== expectedBookingStatus(cause)) {
            this.fail("Booking status does not match the Wallet release cause.", "BOOKING_WALLET_RELEASE_INVALID_BOOKING_STATUS");
        }
        const expectedTermination = new Map([
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED, bookingTerminationType_enum_1.BookingTerminationType.CREATOR_REJECTED],
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.REQUEST_EXPIRED, bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED],
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.USER_CANCELLED, bookingTerminationType_enum_1.BookingTerminationType.CUSTOMER_CANCELLED],
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_CANCELLED, bookingTerminationType_enum_1.BookingTerminationType.CREATOR_CANCELLED],
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.ADMIN_CANCELLED, bookingTerminationType_enum_1.BookingTerminationType.ADMIN_CANCELLED],
            [bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.GOVERNANCE_TERMINATED, bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED],
        ]).get(cause);
        if (booking.terminationType !== expectedTermination) {
            this.fail("Persisted Booking termination does not match the release cause.", "BOOKING_WALLET_RELEASE_CAUSE_CONFLICT");
        }
    }
    validateIdentity(graph) {
        const { booking, payment, reservation } = graph;
        if (booking.paymentMethod !== paymentMethod_enum_1.PaymentMethod.WALLET ||
            payment.method !== paymentMethod_enum_1.PaymentMethod.WALLET) {
            this.fail("Booking Payment method is not Wallet.", "BOOKING_WALLET_RELEASE_PAYMENT_METHOD_CONFLICT");
        }
        if (reservation.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentId.toString() !== payment._id.toString() ||
            payment.bookingId.toString() !== booking._id.toString() ||
            reservation.paymentReference !== payment.paymentReference ||
            booking.paymentReference !== payment.paymentReference ||
            booking.reservationReference !== reservation.reservationReference) {
            this.fail("Booking, Payment, and reservation links are inconsistent.", "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT");
        }
        if (reservation.userId.toString() !== booking.userId.toString() ||
            payment.userId.toString() !== booking.userId.toString() ||
            reservation.creatorId.toString() !== booking.creatorId.toString() ||
            payment.creatorId.toString() !== booking.creatorId.toString() ||
            reservation.serviceId.toString() !== booking.serviceId.toString()) {
            this.fail("Wallet release participant identity is inconsistent.", "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT");
        }
        if (!payment.walletId ||
            !payment.reservationId ||
            payment.walletId.toString() !== reservation.walletId.toString() ||
            payment.reservationId.toString() !== reservation._id.toString()) {
            this.fail("Payment Wallet reservation identity is inconsistent.", "BOOKING_WALLET_RELEASE_IDENTITY_CONFLICT");
        }
        if (reservation.amount !== booking.totalAmount ||
            payment.amount !== reservation.amount ||
            payment.authorizedAmount !== reservation.amount) {
            this.fail("Wallet release amount conflicts with authorization.", "BOOKING_WALLET_RELEASE_AMOUNT_CONFLICT");
        }
        if (reservation.currency !== booking.currency ||
            payment.currency !== reservation.currency) {
            this.fail("Wallet release currency conflicts with authorization.", "BOOKING_WALLET_RELEASE_CURRENCY_CONFLICT");
        }
        if (!reservation.ledgerTransactionId || !reservation.reservationKey) {
            this.fail("Reservation authorization identity is incomplete.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        if (booking.isFinancialLocked || booking.settlementId || payment.settlementId) {
            this.fail("Booking has entered a financially locked or settled state.", "BOOKING_WALLET_RELEASE_COMPLETION_CONFLICT");
        }
    }
    async loadGraph(bookingId, session) {
        const booking = await booking_repository_1.bookingRepository.findById(bookingId, session);
        if (!booking) {
            this.fail("Booking not found.", "BOOKING_WALLET_RELEASE_BOOKING_NOT_FOUND");
        }
        if (!booking.paymentId) {
            this.fail("Booking Payment link is missing.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        const [payment, reservation] = await Promise.all([
            payment_repository_1.paymentRepository.findByIdWithWalletLinks(booking.paymentId, session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByBookingWithHiddenReleaseLinks(booking._id, session),
        ]);
        if (!payment) {
            this.fail("Payment not found.", "BOOKING_WALLET_RELEASE_PAYMENT_NOT_FOUND");
        }
        if (!reservation) {
            this.fail("Wallet booking reservation was not found.", "BOOKING_WALLET_RELEASE_RESERVATION_NOT_FOUND");
        }
        return { booking, payment, reservation };
    }
    identity(graph, cause) {
        const { booking, payment, reservation } = graph;
        if (!booking.bookingReference || !reservation.ledgerTransactionId) {
            this.fail("Wallet release identity is incomplete.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        return (0, bookingWalletReleaseIdentity_util_1.deriveBookingWalletReleaseIdentity)({
            reservationKey: reservation.reservationKey,
            reservationReference: reservation.reservationReference,
            authorizationTransactionId: reservation.ledgerTransactionId,
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            bookingStatus: booking.status,
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
            !reservation.releaseReference ||
            !reservation.releaseCause ||
            !reservation.releasedAt) {
            this.fail("Released Wallet reservation is missing safe result data.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        return {
            booking: { bookingReference: booking.bookingReference, status: booking.status },
            payment: {
                paymentReference: payment.paymentReference,
                method: paymentMethod_enum_1.PaymentMethod.WALLET,
                status: payment.status,
                releaseReference: reservation.releaseReference,
            },
            reservation: {
                reservationReference: reservation.reservationReference,
                status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED,
                releaseReference: reservation.releaseReference,
                releaseCause: reservation.releaseCause,
                amount: reservation.amount,
                currency: reservation.currency,
                releasedAt: reservation.releasedAt,
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
    async validateReleasedGraph(graph, cause, session) {
        const { booking, payment, reservation } = graph;
        this.validateCause(booking, cause);
        this.validateIdentity(graph);
        if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED) {
            this.fail("Reservation is not released.", "BOOKING_WALLET_RELEASE_INVALID_RESERVATION_STATUS");
        }
        const identity = this.identity(graph, cause);
        if (reservation.releaseCause !== cause ||
            reservation.releaseKey !== identity.releaseKey ||
            reservation.releaseReference !== identity.releaseReference ||
            reservation.releaseTransactionId !== identity.releaseTransactionId ||
            reservation.releaseFingerprint !== identity.releaseFingerprint ||
            !reservation.releasedAt ||
            !reservation.releaseProjectionOperationId ||
            !reservation.releaseProjectionOperationReference ||
            reservation.releaseLedgerEntryIds.length !== 2) {
            this.fail("Released reservation identity or links are inconsistent.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        if (payment.status !== targetPaymentStatus(cause) ||
            payment.releaseReference !== identity.releaseReference ||
            payment.releaseCause !== cause ||
            payment.releasedAmount !== reservation.amount ||
            !payment.releasedAt ||
            payment.releasedAt.getTime() !== reservation.releasedAt.getTime()) {
            this.fail("Released Payment state is inconsistent.", "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.releaseTransactionId,
            source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
            type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_RELEASED,
        }, session);
        if (entries.length !== 2) {
            this.fail("Release Ledger transaction is incomplete.", "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT");
        }
        const expectedLedgerIds = new Set(reservation.releaseLedgerEntryIds.map(String));
        const commonLedgerValid = entries.every((entry) => expectedLedgerIds.has(entry._id.toString()) &&
            entry.bookingId?.toString() === booking._id.toString() &&
            entry.paymentId?.toString() === payment._id.toString() &&
            entry.userId?.toString() === reservation.userId.toString() &&
            entry.walletId?.toString() === reservation.walletId.toString() &&
            entry.amount === reservation.amount &&
            entry.currency === reservation.currency &&
            entry.metadata?.reservationReference === reservation.reservationReference &&
            entry.metadata?.releaseCause === cause);
        const reservedDebit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.postingKey === identity.reservedPostingKey);
        const availableCredit = entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
            entry.postingKey === identity.availablePostingKey);
        if (!commonLedgerValid || !reservedDebit || !availableCredit) {
            this.fail("Release Ledger entries do not prove the expected reclassification.", "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT");
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
        const projectionLedgerIds = new Set(projection?.ledgerEntryIds.map(String) ?? []);
        if (!projection ||
            projection._id.toString() !== reservation.releaseProjectionOperationId.toString() ||
            projection.operationReference !== reservation.releaseProjectionOperationReference ||
            projection.walletId.toString() !== reservation.walletId.toString() ||
            projection.userId.toString() !== reservation.userId.toString() ||
            projection.currency !== reservation.currency ||
            projection.deltas.availableBalance !== reservation.amount ||
            projection.deltas.reservedBalance !== -reservation.amount ||
            projection.deltas.lockedBalance !== 0 ||
            projectionLedgerIds.size !== 2 ||
            !entries.every((entry) => projectionLedgerIds.has(entry._id.toString()))) {
            this.fail("Release Wallet projection is inconsistent.", "BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT");
        }
        const wallet = await wallet_repository_1.walletRepository.findById(reservation.walletId, session);
        if (!wallet ||
            wallet.userId.toString() !== reservation.userId.toString() ||
            wallet.currency !== reservation.currency ||
            wallet.currentBalance !==
                wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance) {
            this.fail("Released Wallet projection state is inconsistent.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        return this.safe(graph, wallet, true);
    }
    async validateReplay(input) {
        const graph = await this.loadGraph(input.bookingId, input.session);
        return this.validateReleasedGraph(graph, input.cause, input.session);
    }
    async release(input) {
        if (!input.session.inTransaction()) {
            this.fail("Wallet release requires an active transaction.", "BOOKING_WALLET_RELEASE_TRANSACTION_CONFLICT");
        }
        const graph = await this.loadGraph(input.bookingId, input.session);
        this.validateCause(graph.booking, input.cause);
        this.validateIdentity(graph);
        const { booking, payment, reservation } = graph;
        if (reservation.status === bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED) {
            this.fail("Captured Wallet reservations cannot be released.", "BOOKING_WALLET_RELEASE_ALREADY_CAPTURED");
        }
        if (reservation.status === bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED) {
            return this.validateReleasedGraph(graph, input.cause, input.session);
        }
        if (reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE) {
            this.fail("Only ACTIVE Wallet reservations can be released.", "BOOKING_WALLET_RELEASE_INVALID_RESERVATION_STATUS");
        }
        if (reservation.releaseReference ||
            reservation.releaseKey ||
            reservation.releaseTransactionId ||
            reservation.releaseLedgerEntryIds.length > 0 ||
            reservation.releaseProjectionOperationId ||
            reservation.releaseProjectionOperationReference ||
            reservation.releaseCause ||
            reservation.releasedAt ||
            reservation.releaseFingerprint) {
            this.fail("ACTIVE reservation contains partial release authority.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        if (payment.status === paymentStatus_enum_1.PaymentStatus.CAPTURED || payment.status === paymentStatus_enum_1.PaymentStatus.SETTLED) {
            this.fail("Captured or settled Wallet Payments cannot release authorization.", "BOOKING_WALLET_RELEASE_ALREADY_CAPTURED");
        }
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.AUTHORIZED) {
            this.fail("Wallet Payment is not in the authorized state.", "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS");
        }
        const identity = this.identity(graph, input.cause);
        const [existingEntries, existingProjection, existingRelease] = await Promise.all([
            ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                transactionId: identity.releaseTransactionId,
            }, input.session),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, input.session),
            bookingFundReservation_repository_1.bookingFundReservationRepository.findByReleaseKey(identity.releaseKey, input.session),
        ]);
        if (existingEntries.length || existingProjection || existingRelease) {
            this.fail("A partial or conflicting Wallet release graph already exists.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        let reservedDebit;
        let availableCredit;
        try {
            const common = {
                type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_RELEASED,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
                money: { amount: reservation.amount, currency: reservation.currency },
                transactionId: identity.releaseTransactionId,
                bookingId: booking._id.toString(),
                paymentId: payment._id.toString(),
                userId: reservation.userId.toString(),
                walletId: reservation.walletId.toString(),
                idempotencyKey: identity.releaseTransactionId,
                metadata: {
                    reservationReference: reservation.reservationReference,
                    releaseReference: identity.releaseReference,
                    releaseCause: input.cause,
                },
            };
            reservedDebit = await ledger_service_1.ledgerService.createDebit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED,
                postingKey: identity.reservedPostingKey,
                description: "Booking Wallet reserved funds released",
            }, input.session);
            availableCredit = await ledger_service_1.ledgerService.createCredit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
                postingKey: identity.availablePostingKey,
                description: "Booking Wallet available funds restored",
            }, input.session);
        }
        catch (error) {
            if (isTransientTransactionError(error))
                throw error;
            this.fail("Ledger could not record the Wallet reservation release.", "BOOKING_WALLET_RELEASE_LEDGER_CONFLICT", error);
        }
        let wallet;
        try {
            wallet = await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                userId: reservation.userId,
                currency: reservation.currency,
                operationKey: identity.projectionOperationKey,
                deltas: {
                    availableBalance: reservation.amount,
                    reservedBalance: -reservation.amount,
                    lockedBalance: 0,
                },
                minimums: { reservedBalance: reservation.amount },
                ledgerEntryIds: [
                    reservedDebit._id,
                    availableCredit._id,
                ],
            }, input.session);
        }
        catch (error) {
            if (isTransientTransactionError(error))
                throw error;
            if (error instanceof WalletError_1.WalletError && error.code === "WALLET_INSUFFICIENT_BALANCE") {
                this.fail("Wallet reserved balance is below the authoritative reservation amount.", "BOOKING_WALLET_RELEASE_INSUFFICIENT_RESERVED_BALANCE", error);
            }
            this.fail("Wallet projection could not apply the reservation release.", "BOOKING_WALLET_RELEASE_PROJECTION_CONFLICT", error);
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, input.session);
        if (!projection) {
            this.fail("Release projection operation is missing.", "BOOKING_WALLET_RELEASE_INTEGRITY_ERROR");
        }
        const releasedAt = new Date();
        const released = await bookingFundReservation_repository_1.bookingFundReservationRepository.guardActiveToReleased({
            reservationId: reservation._id,
            bookingId: booking._id,
            paymentId: payment._id,
            walletId: reservation.walletId,
            amount: reservation.amount,
            currency: reservation.currency,
            releaseReference: identity.releaseReference,
            releaseKey: identity.releaseKey,
            releaseTransactionId: identity.releaseTransactionId,
            releaseLedgerEntryIds: [
                reservedDebit._id,
                availableCredit._id,
            ],
            releaseProjectionOperationId: projection._id,
            releaseProjectionOperationReference: projection.operationReference,
            releaseCause: input.cause,
            releaseReason: input.reason?.trim(),
            releasedAt,
            releasedByType: input.actorType,
            releasedById: input.actorId,
            releaseFingerprint: identity.releaseFingerprint,
            expectedVersion: reservation.version,
        }, input.session);
        if (!released) {
            this.fail("Reservation release transition conflicted.", "BOOKING_WALLET_RELEASE_TRANSACTION_CONFLICT");
        }
        const releasedPayment = await payment_repository_1.paymentRepository.guardWalletAuthorizationToReleasedTerminal({
            paymentId: payment._id,
            bookingId: booking._id,
            reservationId: reservation._id,
            reservationReference: reservation.reservationReference,
            walletId: reservation.walletId,
            amount: reservation.amount,
            currency: reservation.currency,
            targetStatus: targetPaymentStatus(input.cause),
            releaseReference: identity.releaseReference,
            releaseCause: input.cause,
            releasedAt,
        }, input.session);
        if (!releasedPayment) {
            this.fail("Payment release transition conflicted.", "BOOKING_WALLET_RELEASE_INVALID_PAYMENT_STATUS");
        }
        const auditActor = input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CUSTOMER
            ? { type: "USER", id: input.actorId }
            : input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.CREATOR
                ? { type: "CREATOR", id: input.actorId }
                : input.actorType === bookingTerminationType_enum_1.BookingTerminationActorType.ADMIN
                    ? { type: "ADMIN", id: input.actorId }
                    : { type: "SYSTEM", reference: "booking-wallet-release" };
        await (0, auditLog_service_1.createFinancialAudit)({
            action: auditAction_enum_1.AuditAction.BOOKING_WALLET_RESERVATION_RELEASED,
            actor: auditActor,
            entityType: "BOOKING_FUND_RESERVATION",
            entityId: released._id,
            financialContext: {
                domain: "BOOKING_WALLET",
                primaryReference: identity.releaseReference,
                bookingReference: booking.bookingReference,
                paymentReference: payment.paymentReference,
                amount: reservation.amount,
                currency: reservation.currency,
                ledgerTransactionReference: identity.releaseTransactionId,
                projectionOperationReference: projection.operationReference,
            },
            transition: {
                fromStatus: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE,
                toStatus: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED,
                outcome: "SUCCEEDED",
            },
            metadata: { reasonCode: input.cause },
            session: input.session,
        });
        return this.safe({
            booking,
            payment: releasedPayment,
            reservation: released,
        }, wallet, false);
    }
}
exports.BookingWalletReservationReleaseService = BookingWalletReservationReleaseService;
exports.bookingWalletReservationReleaseService = new BookingWalletReservationReleaseService();
