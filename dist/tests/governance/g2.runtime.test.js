"use strict";
/// <reference path="../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../models/booking.model");
const bookingFundReservation_model_1 = require("../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const payment_model_1 = require("../../models/payment.model");
const slot_model_1 = require("../../models/slot.model");
const wallet_model_1 = require("../../models/wallet.model");
const bookingTerminationType_enum_1 = require("../../enums/booking/bookingTerminationType.enum");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const bookingWalletReleaseCause_enum_1 = require("../../enums/financial/bookingWalletReleaseCause.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const bookingFinancialTermination_service_1 = require("../../services/financial/bookingFinancialTermination.service");
const database_1 = require("../financial/phase7h/helpers/database");
const bookingWalletReleaseFixtures_1 = require("../financial/phase8b/fixtures/bookingWalletReleaseFixtures");
const bookingWalletCaptureFixtures_1 = require("../financial/phase8c/fixtures/bookingWalletCaptureFixtures");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "governance-g2-test-jwt-secret";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const terminateForGovernance = (bookingId, adminId) => bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorId: adminId,
    actorType: bookingTerminationType_enum_1.BookingTerminationActorType.GOVERNANCE,
    terminationType: bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED,
    reason: "Governance classified this pre-capture booking for termination.",
});
const assertGovernanceRelease = async (bookingId, walletId, expectedAmount) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    const [payment, reservation, wallet, slots, entries] = await Promise.all([
        payment_model_1.Payment.findOne({ bookingId }).orFail(),
        bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).orFail(),
        wallet_model_1.Wallet.findById(walletId).orFail(),
        slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }),
        ledgerEntry_model_1.LedgerEntry.find({ bookingId, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }),
    ]);
    strict_1.default.equal(booking.status, "CANCELLED");
    strict_1.default.equal(booking.terminationType, bookingTerminationType_enum_1.BookingTerminationType.GOVERNANCE_TERMINATED);
    strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CANCELLED);
    strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.RELEASED);
    strict_1.default.equal(reservation.releaseCause, bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.GOVERNANCE_TERMINATED);
    strict_1.default.equal(wallet.availableBalance, 200000);
    strict_1.default.equal(wallet.reservedBalance, 0);
    strict_1.default.equal(wallet.currentBalance, 200000);
    strict_1.default.ok(slots.every((slot) => slot.status === "AVAILABLE"));
    strict_1.default.equal(entries.length, 2);
    strict_1.default.ok(entries.every((entry) => entry.amount === expectedAmount));
};
(0, node_test_1.test)("G2 governance termination releases a REQUESTED Wallet reservation exactly once", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 200000, slotAmounts: [100000] });
        const result = await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
        strict_1.default.equal(result.financialAction, "RELEASE");
        await assertGovernanceRelease(String(booking._id), fixture.actors.wallet._id, 105000);
        const replay = await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
        strict_1.default.equal(replay.replay, true);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: booking._id, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 2);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("G2 governance termination releases an uncaptured CONFIRMED Wallet reservation", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const { fixture, booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 200000, slotAmounts: [100000] });
        const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
        strict_1.default.equal(accepted.status, 200, JSON.stringify(accepted.body));
        await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
        await assertGovernanceRelease(String(booking._id), fixture.actors.wallet._id, 105000);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("G2 governance termination races another termination cause without duplicate Wallet release", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const { fixture, booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 200000, slotAmounts: [100000] });
        const [governance, creator] = await Promise.allSettled([
            terminateForGovernance(String(booking._id), String(fixture.actors.adminId)),
            (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, String(booking._id), creatorToken, "REJECT"),
        ]);
        strict_1.default.ok(governance.status === "fulfilled" || (creator.status === "fulfilled" && creator.value.status === 200));
        const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
        strict_1.default.equal(wallet.availableBalance, 200000);
        strict_1.default.equal(wallet.reservedBalance, 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: booking._id, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 2);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("G2 fails closed after capture and creates no governance release effect", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const { fixture, booking, creatorToken } = await (0, bookingWalletCaptureFixtures_1.createAcceptedWalletBooking)(server.baseUrl, { walletAmount: 200000, slotAmounts: [100000] });
        const completed = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, String(booking._id), creatorToken);
        strict_1.default.equal(completed.status, 200, JSON.stringify(completed.body));
        const beforeReleaseEntries = await ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: booking._id, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE });
        await strict_1.default.rejects(() => terminateForGovernance(String(booking._id), String(fixture.actors.adminId)));
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: booking._id, source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), beforeReleaseEntries);
        const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
        strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
    }
    finally {
        await server.close();
    }
});
