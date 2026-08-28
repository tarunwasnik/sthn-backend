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
const dispute_model_1 = require("../../models/dispute.model");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const payment_model_1 = require("../../models/payment.model");
const slot_model_1 = require("../../models/slot.model");
const wallet_model_1 = require("../../models/wallet.model");
const bookingFundReservationStatus_enum_1 = require("../../enums/financial/bookingFundReservationStatus.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const banLifecycle_service_1 = require("../../services/accountGovernance/banLifecycle.service");
const suspensionLifecycle_service_1 = require("../../services/accountGovernance/suspensionLifecycle.service");
const database_1 = require("../financial/phase7h/helpers/database");
const bookingWalletReleaseFixtures_1 = require("../financial/phase8b/fixtures/bookingWalletReleaseFixtures");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "governance-g3-test-jwt-secret";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const setBookingTimes = async (bookingId, start, end) => {
    const booking = await booking_model_1.Booking.findById(bookingId).orFail();
    await slot_model_1.Slot.updateMany({ _id: { $in: booking.slotIds } }, { $set: { startTime: start, endTime: end } });
};
const accept = async (baseUrl, bookingId, token) => {
    const response = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(baseUrl, bookingId, token, "ACCEPT");
    strict_1.default.equal(response.status, 200, JSON.stringify(response.body));
};
(0, node_test_1.test)("G3 suspension classifies customer obligations independently and terminates only safe candidates", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const options = { walletAmount: 1000000, slotAmounts: [100000] };
        const requested = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, options);
        const protectedBooking = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { ...options, actors: requested.fixture.actors });
        const future = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { ...options, actors: requested.fixture.actors });
        const disputed = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { ...options, actors: requested.fixture.actors });
        const locked = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { ...options, actors: requested.fixture.actors });
        const now = Date.now();
        await setBookingTimes(String(requested.booking._id), new Date(now + 2 * 60 * 60 * 1000), new Date(now + 3 * 60 * 60 * 1000));
        await accept(server.baseUrl, String(protectedBooking.booking._id), protectedBooking.creatorToken);
        await setBookingTimes(String(protectedBooking.booking._id), new Date(now + 12 * 60 * 60 * 1000), new Date(now + 13 * 60 * 60 * 1000));
        await accept(server.baseUrl, String(future.booking._id), future.creatorToken);
        await setBookingTimes(String(future.booking._id), new Date(now + 30 * 60 * 60 * 1000), new Date(now + 31 * 60 * 60 * 1000));
        await dispute_model_1.Dispute.create({ bookingId: disputed.booking._id, raisedBy: requested.fixture.actors.userId, raisedByRole: "USER", reason: "Open dispute" });
        const lockedBooking = await booking_model_1.Booking.findById(locked.booking._id).orFail();
        lockedBooking.isFinancialLocked = true;
        await lockedBooking.save();
        const result = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId: String(requested.fixture.actors.adminId), userId: String(requested.fixture.actors.userId), reason: "G3 test suspension" });
        strict_1.default.equal(result.consequences.terminatedCount, 2);
        strict_1.default.equal(result.consequences.protectedCount, 1);
        strict_1.default.equal(result.consequences.disputeLockedCount, 1);
        strict_1.default.equal(result.consequences.financialLockedCount, 1);
        strict_1.default.equal((await booking_model_1.Booking.findById(requested.booking._id).orFail()).status, "CANCELLED");
        strict_1.default.equal((await booking_model_1.Booking.findById(future.booking._id).orFail()).status, "CANCELLED");
        strict_1.default.equal((await booking_model_1.Booking.findById(protectedBooking.booking._id).orFail()).status, "CONFIRMED");
        strict_1.default.equal((await booking_model_1.Booking.findById(disputed.booking._id).orFail()).status, "REQUESTED");
        strict_1.default.equal((await booking_model_1.Booking.findById(locked.booking._id).orFail()).status, "REQUESTED");
        const wallet = await wallet_model_1.Wallet.findById(requested.fixture.actors.wallet._id).orFail();
        strict_1.default.equal(wallet.reservedBalance, 315000);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 4);
        const replay = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId: String(requested.fixture.actors.adminId), userId: String(requested.fixture.actors.userId), reason: "replay" });
        strict_1.default.equal(replay.consequences.terminatedCount, 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 4);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("G3 ban applies the same customer/creator timing policy and protects the exact 24-hour boundary", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const first = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 400000, slotAmounts: [100000] });
        const boundary = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 400000, slotAmounts: [100000], actors: first.fixture.actors });
        const later = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 400000, slotAmounts: [100000], actors: first.fixture.actors });
        const now = Date.now();
        await accept(server.baseUrl, String(boundary.booking._id), boundary.creatorToken);
        await setBookingTimes(String(boundary.booking._id), new Date(now + 24 * 60 * 60 * 1000), new Date(now + 25 * 60 * 60 * 1000));
        await accept(server.baseUrl, String(later.booking._id), later.creatorToken);
        await setBookingTimes(String(later.booking._id), new Date(now + 24 * 60 * 60 * 1000 + 1), new Date(now + 25 * 60 * 60 * 1000));
        const result = await (0, banLifecycle_service_1.triggerBanLifecycle)({ adminId: String(first.fixture.actors.adminId), userId: String(first.fixture.actors.creatorId), reason: "G3 creator ban", now: new Date(now) });
        strict_1.default.equal(result.consequences.terminatedCount, 2);
        strict_1.default.equal(result.consequences.protectedCount, 1);
        strict_1.default.equal((await booking_model_1.Booking.findById(first.booking._id).orFail()).status, "CANCELLED");
        strict_1.default.equal((await booking_model_1.Booking.findById(boundary.booking._id).orFail()).status, "CONFIRMED");
        strict_1.default.equal((await booking_model_1.Booking.findById(later.booking._id).orFail()).status, "CANCELLED");
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("G3 protects ongoing confirmed sessions and treats captured reservations as financial locks", async () => {
    const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
    try {
        const ongoing = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 300000, slotAmounts: [100000] });
        const captured = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 300000, slotAmounts: [100000], actors: ongoing.fixture.actors });
        await accept(server.baseUrl, String(ongoing.booking._id), ongoing.creatorToken);
        await setBookingTimes(String(ongoing.booking._id), new Date(Date.now() - 30 * 60 * 1000), new Date(Date.now() + 30 * 60 * 1000));
        const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: captured.booking._id }).orFail();
        reservation.status = bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED;
        await reservation.save();
        const payment = await payment_model_1.Payment.findById(captured.booking.paymentId).orFail();
        payment.status = paymentStatus_enum_1.PaymentStatus.CAPTURED;
        await payment.save();
        const result = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId: String(ongoing.fixture.actors.adminId), userId: String(ongoing.fixture.actors.creatorId), reason: "G3 ongoing" });
        strict_1.default.equal(result.consequences.protectedCount, 1);
        strict_1.default.equal(result.consequences.financialLockedCount, 1);
        strict_1.default.equal((await booking_model_1.Booking.findById(ongoing.booking._id).orFail()).status, "CONFIRMED");
        strict_1.default.equal((await booking_model_1.Booking.findById(captured.booking._id).orFail()).status, "REQUESTED");
    }
    finally {
        await server.close();
    }
});
