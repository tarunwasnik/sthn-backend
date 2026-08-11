"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingWalletReservationService = exports.BookingWalletReservationService = void 0;
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const BookingWalletReservationError_1 = require("../../errors/financial/BookingWalletReservationError");
const WalletError_1 = require("../../errors/financial/WalletError");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const bookingWalletReservationIdentity_util_1 = require("../../utils/financial/bookingWalletReservationIdentity.util");
const ledger_service_1 = require("./ledger.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
class BookingWalletReservationService {
    fail(message, code, cause) {
        throw new BookingWalletReservationError_1.BookingWalletReservationError(message, code, { cause });
    }
    assertIntent(input) {
        const { booking, payment, authenticatedUserId, currency, session } = input;
        if (!session.inTransaction()) {
            this.fail("Booking Wallet reservation requires an active transaction.", "BOOKING_WALLET_RESERVATION_TRANSACTION_CONFLICT");
        }
        if (booking.status !== "REQUESTED") {
            this.fail("Booking is not eligible for Wallet authorization.", "BOOKING_WALLET_RESERVATION_BOOKING_CONFLICT");
        }
        if (![paymentStatus_enum_1.PaymentStatus.CREATED, paymentStatus_enum_1.PaymentStatus.AUTHORIZED].includes(payment.status) ||
            payment.method !== paymentMethod_enum_1.PaymentMethod.WALLET) {
            this.fail("Payment is not eligible for Wallet authorization.", "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT");
        }
        if (payment.status === paymentStatus_enum_1.PaymentStatus.AUTHORIZED &&
            (payment.authorizedAmount !== booking.totalAmount ||
                !payment.reservationReference ||
                payment.reservationReference !== booking.reservationReference)) {
            this.fail("Authorized Payment does not match the Booking reservation.", "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT");
        }
        if (booking.userId.toString() !== authenticatedUserId.toString() ||
            payment.userId.toString() !== authenticatedUserId.toString()) {
            this.fail("Wallet ownership does not match the authenticated customer.", "BOOKING_WALLET_RESERVATION_WALLET_OWNERSHIP_CONFLICT");
        }
        if (payment.bookingId.toString() !== booking._id.toString() ||
            payment.creatorId.toString() !== booking.creatorId.toString()) {
            this.fail("Booking and Payment identity are inconsistent.", "BOOKING_WALLET_RESERVATION_INTEGRITY_ERROR");
        }
        if (!Number.isSafeInteger(booking.totalAmount) ||
            booking.totalAmount <= 0 ||
            payment.amount !== booking.totalAmount ||
            payment.serviceAmount !== booking.serviceAmount ||
            booking.price !== booking.serviceAmount ||
            payment.customerFeeAmount !== booking.platformFeeAmount ||
            booking.serviceAmount + booking.platformFeeAmount !== booking.totalAmount) {
            this.fail("Wallet reservation amount must equal the positive booking snapshot amount.", "BOOKING_WALLET_RESERVATION_INVALID_AMOUNT");
        }
        if (booking.currency !== currency || payment.currency !== currency) {
            this.fail("Booking and Payment currency are inconsistent.", "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT");
        }
    }
    mapProjectionError(error) {
        if (error instanceof WalletError_1.WalletError) {
            if (error.code === "WALLET_INSUFFICIENT_BALANCE") {
                this.fail("Insufficient available Wallet balance.", "BOOKING_WALLET_RESERVATION_INSUFFICIENT_AVAILABLE_BALANCE", error);
            }
            if (error.code === "WALLET_NOT_FOUND") {
                this.fail("Wallet not found.", "BOOKING_WALLET_RESERVATION_WALLET_NOT_FOUND", error);
            }
        }
        this.fail("Wallet projection could not apply the booking reservation.", "BOOKING_WALLET_RESERVATION_PROJECTION_CONFLICT", error);
    }
    async authorize(input) {
        this.assertIntent(input);
        const { booking, payment, authenticatedUserId, currency, session } = input;
        const wallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(authenticatedUserId, currency, session);
        if (!wallet) {
            const otherWallet = await wallet_repository_1.walletRepository.findAnyByUser(authenticatedUserId, session);
            this.fail(otherWallet
                ? "Wallet currency does not match the booking currency."
                : "Wallet not found.", otherWallet
                ? "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT"
                : "BOOKING_WALLET_RESERVATION_WALLET_NOT_FOUND");
        }
        if (wallet.userId.toString() !== authenticatedUserId.toString()) {
            this.fail("Wallet ownership does not match the authenticated customer.", "BOOKING_WALLET_RESERVATION_WALLET_OWNERSHIP_CONFLICT");
        }
        const identity = (0, bookingWalletReservationIdentity_util_1.deriveBookingWalletReservationIdentity)({
            bookingId: booking._id,
            paymentId: payment._id,
            paymentReference: payment.paymentReference,
            userId: authenticatedUserId,
            walletId: wallet._id,
            creatorId: booking.creatorId,
            serviceId: booking.serviceId,
            amount: booking.totalAmount,
            currency,
            method: paymentMethod_enum_1.PaymentMethod.WALLET,
        });
        const created = await bookingFundReservation_repository_1.bookingFundReservationRepository.createOrFindDeterministicReservation({
            reservationReference: identity.reservationReference,
            reservationKey: identity.reservationKey,
            bookingId: booking._id,
            bookingReference: booking.bookingReference ?? booking._id.toString(),
            paymentId: payment._id,
            paymentReference: payment.paymentReference,
            userId: authenticatedUserId,
            walletId: wallet._id,
            creatorId: booking.creatorId,
            serviceId: booking.serviceId,
            amount: booking.totalAmount,
            currency,
            status: bookingFundReservationStatus_enum_1.BookingFundReservationStatus.PENDING,
            requestFingerprint: identity.requestFingerprint,
            version: 0,
        }, session);
        if (created.reservation.requestFingerprint !== identity.requestFingerprint) {
            this.fail("Reservation identity conflicts with the persisted intent.", "BOOKING_WALLET_RESERVATION_IDENTITY_CONFLICT");
        }
        if (!created.created) {
            if (created.reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE) {
                this.fail("Reservation is not in a replayable state.", "BOOKING_WALLET_RESERVATION_INVALID_STATUS");
            }
            return {
                reservation: created.reservation,
                availableBalance: wallet.availableBalance,
                reservedBalance: wallet.reservedBalance,
                lockedBalance: wallet.lockedBalance,
                currentBalance: wallet.currentBalance,
            };
        }
        let availableDebit;
        let reservedCredit;
        try {
            const common = {
                type: ledgerEntryType_enum_1.LedgerEntryType.BOOKING_FUNDS_RESERVED,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION,
                money: { amount: booking.totalAmount, currency },
                transactionId: identity.ledgerTransactionId,
                bookingId: booking._id.toString(),
                paymentId: payment._id.toString(),
                userId: authenticatedUserId.toString(),
                walletId: wallet._id.toString(),
                idempotencyKey: identity.ledgerTransactionId,
                metadata: {
                    reservationReference: identity.reservationReference,
                    paymentReference: payment.paymentReference,
                },
            };
            availableDebit = await ledger_service_1.ledgerService.createDebit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
                postingKey: identity.availablePostingKey,
                description: "Booking Wallet available funds reserved",
            }, session);
            reservedCredit = await ledger_service_1.ledgerService.createCredit({
                ...common,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED,
                postingKey: identity.reservedPostingKey,
                description: "Booking Wallet reserved funds increase",
            }, session);
        }
        catch (error) {
            this.fail("Ledger could not record the booking Wallet reservation.", "BOOKING_WALLET_RESERVATION_LEDGER_CONFLICT", error);
        }
        let projectedWallet;
        try {
            projectedWallet = await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                userId: authenticatedUserId,
                currency,
                operationKey: identity.projectionOperationKey,
                deltas: {
                    availableBalance: -booking.totalAmount,
                    reservedBalance: booking.totalAmount,
                    lockedBalance: 0,
                },
                minimums: { availableBalance: booking.totalAmount },
                ledgerEntryIds: [
                    availableDebit._id,
                    reservedCredit._id,
                ],
            }, session);
        }
        catch (error) {
            this.mapProjectionError(error);
        }
        const projection = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.projectionOperationKey, session);
        if (!projection) {
            this.fail("Wallet projection operation is missing after projection.", "BOOKING_WALLET_RESERVATION_INTEGRITY_ERROR");
        }
        const authorizedAt = new Date();
        const active = await bookingFundReservation_repository_1.bookingFundReservationRepository.markActiveFromPending(created.reservation._id, {
            ledgerTransactionId: identity.ledgerTransactionId,
            ledgerEntryIds: [
                availableDebit._id,
                reservedCredit._id,
            ],
            projectionOperationId: projection._id,
            projectionOperationReference: projection.operationReference,
            authorizedAt,
        }, session);
        if (!active) {
            this.fail("Reservation status changed concurrently.", "BOOKING_WALLET_RESERVATION_INVALID_STATUS");
        }
        const authorizedPayment = await payment_repository_1.paymentRepository.transition(payment._id, [paymentStatus_enum_1.PaymentStatus.CREATED], {
            $set: {
                status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
                walletId: wallet._id,
                reservationId: active._id,
                reservationReference: active.reservationReference,
                authorizedAmount: booking.totalAmount,
                authorizedAt,
                retryable: false,
            },
        }, session);
        if (!authorizedPayment) {
            this.fail("Payment authorization state changed concurrently.", "BOOKING_WALLET_RESERVATION_PAYMENT_CONFLICT");
        }
        booking.paymentMethod = paymentMethod_enum_1.PaymentMethod.WALLET;
        booking.paymentReference = payment.paymentReference;
        booking.reservationReference = active.reservationReference;
        booking.fundsReservedAt = authorizedAt;
        booking.paymentStatus = "PAID";
        booking.isPayable = true;
        await booking.save({ session });
        return {
            reservation: active,
            availableBalance: projectedWallet.availableBalance,
            reservedBalance: projectedWallet.reservedBalance,
            lockedBalance: projectedWallet.lockedBalance,
            currentBalance: projectedWallet.currentBalance,
        };
    }
}
exports.BookingWalletReservationService = BookingWalletReservationService;
exports.bookingWalletReservationService = new BookingWalletReservationService();
