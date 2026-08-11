"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletCaptureFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const booking_model_1 = require("../../../models/booking.model");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const dispute_model_1 = require("../../../models/dispute.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const ledger_service_1 = require("../../../services/financial/ledger.service");
const bookingWalletCaptureFixtures_1 = require("./fixtures/bookingWalletCaptureFixtures");
const assertUncaptured = async (bookingId, walletId) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const payment = await payment_model_1.Payment.findById(booking.paymentId).orFail();
    const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).orFail();
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    strict_1.default.equal(booking.status, "CONFIRMED");
    strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
    strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
    strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [580, 420, 1000]);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
    }), 0);
};
const registerBookingWalletCaptureFailureTests = () => {
    (0, node_test_1.test)("phase8c financial lock blocks completion before every capture mutation", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await booking_model_1.Booking.updateOne({ _id: accepted.booking._id }, { $set: { isFinancialLocked: true } });
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_FINANCIAL_LOCKED");
            await assertUncaptured(accepted.booking._id.toString(), accepted.fixture.actors.wallet._id.toString());
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c OPEN dispute blocks completion before every capture mutation", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await dispute_model_1.Dispute.create({
                bookingId: accepted.booking._id,
                raisedBy: accepted.fixture.actors.userId,
                raisedByRole: "USER",
                reason: "Phase 8C controlled OPEN dispute",
                status: "OPEN",
                slaHours: 48,
                escalationLevel: "NONE",
                signals: [],
            });
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_DISPUTE_OPEN");
            await assertUncaptured(accepted.booking._id.toString(), accepted.fixture.actors.wallet._id.toString());
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c insufficient reserved balance rolls back Booking, Payment, Ledger, and projection", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            await wallet_model_1.Wallet.collection.updateOne({ _id: accepted.fixture.actors.wallet._id }, { $set: { availableBalance: 900, reservedBalance: 100, currentBalance: 1000 } });
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_INSUFFICIENT_RESERVED_BALANCE");
            const [booking, payment, reservation, wallet] = await Promise.all([
                booking_model_1.Booking.findById(accepted.booking._id).orFail(),
                payment_model_1.Payment.findById(accepted.booking.paymentId).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
                wallet_model_1.Wallet.findById(accepted.fixture.actors.wallet._id).orFail(),
            ]);
            strict_1.default.equal(booking.status, "CONFIRMED");
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE);
            strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [900, 100, 1000]);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 0);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: wallet._id,
                "deltas.reservedBalance": -420,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c projection interruption rolls back the complete capture transaction", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        const original = walletProjection_service_1.walletProjectionService.applyProjectionMutation.bind(walletProjection_service_1.walletProjectionService);
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = async () => {
                throw new Error("controlled Phase 8C projection interruption");
            };
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT");
            await assertUncaptured(accepted.booking._id.toString(), accepted.fixture.actors.wallet._id.toString());
        }
        finally {
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c Ledger interruption after the debit attempt rolls back every capture effect", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        const original = ledger_service_1.ledgerService.createCredit.bind(ledger_service_1.ledgerService);
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            ledger_service_1.ledgerService.createCredit = async () => {
                throw new Error("controlled Phase 8C Ledger credit interruption");
            };
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
            await assertUncaptured(accepted.booking._id.toString(), accepted.fixture.actors.wallet._id.toString());
        }
        finally {
            ledger_service_1.ledgerService.createCredit = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c audit interruption before commit rolls back every capture effect", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        const auditModel = auditLog_model_1.AuditLog;
        const original = auditModel.create;
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            auditModel.create = (async () => {
                throw new Error("controlled Phase 8C audit interruption");
            });
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_TRANSACTION_CONFLICT");
            await assertUncaptured(accepted.booking._id.toString(), accepted.fixture.actors.wallet._id.toString());
        }
        finally {
            auditModel.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c corrupted captured Ledger direction fails replay closed", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            const first = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(first.status, 200, JSON.stringify(first.body));
            await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                bookingId: accepted.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
                account: ledgerAccount_enum_1.LedgerAccount.WALLET_RESERVED,
            }, { $set: { direction: "CREDIT" } });
            const replay = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(replay.status, 409, JSON.stringify(replay.body));
            strict_1.default.equal(replay.body.code, "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT");
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8c a RELEASED reservation cannot be captured or re-complete the Booking", async () => {
        const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
        try {
            const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
            const cancelled = await (0, bookingWalletCaptureFixtures_1.postUserCancellation)(server.baseUrl, accepted.booking._id.toString(), accepted.fixture);
            strict_1.default.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
            await booking_model_1.Booking.collection.updateOne({ _id: accepted.booking._id }, {
                $set: {
                    status: "CONFIRMED",
                    isPayable: true,
                    isFinancialLocked: false,
                    paymentStatus: "PAID",
                },
                $unset: {
                    terminationType: "",
                    terminatedByType: "",
                    terminatedById: "",
                    terminationReason: "",
                    terminationOperationKey: "",
                    terminatedAt: "",
                },
            });
            const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_CAPTURE_ALREADY_RELEASED");
            const [booking, payment, reservation, wallet] = await Promise.all([
                booking_model_1.Booking.findById(accepted.booking._id).orFail(),
                payment_model_1.Payment.findById(accepted.booking.paymentId).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: accepted.booking._id }).orFail(),
                wallet_model_1.Wallet.findById(accepted.fixture.actors.wallet._id).orFail(),
            ]);
            strict_1.default.equal(booking.status, "CONFIRMED");
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
            strict_1.default.deepEqual([wallet.availableBalance, wallet.reservedBalance, wallet.currentBalance], [1000, 0, 1000]);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    const identityCases = [
        {
            name: "amount",
            code: "BOOKING_WALLET_CAPTURE_AMOUNT_CONFLICT",
            mutate: (bookingId) => booking_model_1.Booking.collection.updateOne({ _id: bookingId }, { $set: { totalAmount: 421 } }),
        },
        {
            name: "currency",
            code: "BOOKING_WALLET_CAPTURE_CURRENCY_CONFLICT",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { currency: "USD" } }),
        },
        {
            name: "payment method",
            code: "BOOKING_WALLET_CAPTURE_PAYMENT_METHOD_CONFLICT",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { method: paymentMethod_enum_1.PaymentMethod.INTERNAL } }),
        },
        {
            name: "customer Wallet identity",
            code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $set: { walletId: new mongoose_1.Types.ObjectId() } }),
        },
        {
            name: "customer User identity",
            code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $set: { userId: new mongoose_1.Types.ObjectId() } }),
        },
        {
            name: "Creator identity",
            code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $set: { creatorId: new mongoose_1.Types.ObjectId() } }),
        },
        {
            name: "service identity",
            code: "BOOKING_WALLET_CAPTURE_IDENTITY_CONFLICT",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $set: { serviceId: new mongoose_1.Types.ObjectId() } }),
        },
        {
            name: "authorization transaction",
            code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $unset: { ledgerTransactionId: "" } }),
        },
        {
            name: "partial capture transaction",
            code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
            mutate: (bookingId) => bookingFundReservation_model_1.BookingFundReservation.collection.updateOne({ bookingId }, { $set: { captureTransactionId: "corrupt-partial-capture" } }),
        },
        {
            name: "Payment terminal status",
            code: "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { status: paymentStatus_enum_1.PaymentStatus.FAILED } }),
        },
    ];
    for (const identityCase of identityCases) {
        (0, node_test_1.test)(`phase8c ${identityCase.name} conflict fails closed`, async () => {
            const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
            try {
                const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
                await identityCase.mutate(accepted.booking._id, accepted.booking.paymentId);
                const response = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
                strict_1.default.equal(response.status, identityCase.code.endsWith("INTEGRITY_ERROR") ? 500 : 409);
                strict_1.default.equal(response.body.code, identityCase.code, JSON.stringify(response.body));
                strict_1.default.equal((await booking_model_1.Booking.findById(accepted.booking._id).orFail()).status, "CONFIRMED");
                strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                    bookingId: accepted.booking._id,
                    source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
                }), 0);
            }
            finally {
                await server.close();
            }
        });
    }
    const replayCorruptions = [
        {
            name: "Booking completion timestamp",
            code: "BOOKING_WALLET_CAPTURE_INTEGRITY_ERROR",
            mutate: (bookingId) => booking_model_1.Booking.collection.updateOne({ _id: bookingId }, { $set: { completedAt: new Date(0) } }),
        },
        {
            name: "Payment capture timestamp",
            code: "BOOKING_WALLET_CAPTURE_INVALID_PAYMENT_STATUS",
            mutate: (_bookingId, paymentId) => payment_model_1.Payment.collection.updateOne({ _id: paymentId }, { $set: { capturedAt: new Date(0) } }),
        },
        {
            name: "projection deltas",
            code: "BOOKING_WALLET_CAPTURE_PROJECTION_CONFLICT",
            mutate: async (bookingId) => {
                const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId })
                    .select("+captureProjectionOperationId")
                    .orFail();
                return walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: reservation.captureProjectionOperationId }, { $set: { "deltas.availableBalance": 1 } });
            },
        },
        {
            name: "clearing account",
            code: "BOOKING_WALLET_CAPTURE_LEDGER_CONFLICT",
            mutate: (bookingId) => ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                bookingId,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
            }, { $set: { account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE } }),
        },
    ];
    for (const corruption of replayCorruptions) {
        (0, node_test_1.test)(`phase8c corrupted ${corruption.name} fails authoritative replay`, async () => {
            const server = await (0, bookingWalletCaptureFixtures_1.startCaptureHttpServer)();
            try {
                const accepted = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl);
                const completed = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
                strict_1.default.equal(completed.status, 200, JSON.stringify(completed.body));
                await corruption.mutate(accepted.booking._id, accepted.booking.paymentId);
                const replay = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, accepted.booking._id.toString(), accepted.creatorToken);
                strict_1.default.equal(replay.body.code, corruption.code, JSON.stringify(replay.body));
                strict_1.default.ok([409, 500].includes(replay.status));
            }
            finally {
                await server.close();
            }
        });
    }
};
exports.registerBookingWalletCaptureFailureTests = registerBookingWalletCaptureFailureTests;
