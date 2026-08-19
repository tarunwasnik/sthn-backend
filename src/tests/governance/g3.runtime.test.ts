/// <reference path="../../types/express.d.ts" />

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Booking } from "../../models/booking.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Dispute } from "../../models/dispute.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Payment } from "../../models/payment.model";
import { Slot } from "../../models/slot.model";
import { Wallet } from "../../models/wallet.model";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { triggerBanLifecycle } from "../../services/accountGovernance/banLifecycle.service";
import { triggerSuspensionLifecycle } from "../../services/accountGovernance/suspensionLifecycle.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";
import { createActiveWalletBooking, postCreatorDecision, startReleaseHttpServer } from "../financial/phase8b/fixtures/bookingWalletReleaseFixtures";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "governance-g3-test-jwt-secret";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const setBookingTimes = async (bookingId: string, start: Date, end: Date) => {
  const booking = await Booking.findById(bookingId).orFail();
  await Slot.updateMany({ _id: { $in: booking.slotIds } }, { $set: { startTime: start, endTime: end } });
};

const accept = async (baseUrl: string, bookingId: string, token: string) => {
  const response = await postCreatorDecision(baseUrl, bookingId, token, "ACCEPT");
  assert.equal(response.status, 200, JSON.stringify(response.body));
};

test("G3 suspension classifies customer obligations independently and terminates only safe candidates", async () => {
  const server = await startReleaseHttpServer();
  try {
    const options = { walletAmount: 1_000_000, slotAmounts: [100_000] };
    const requested = await createActiveWalletBooking(server.baseUrl, options);
    const protectedBooking = await createActiveWalletBooking(server.baseUrl, { ...options, actors: requested.fixture.actors });
    const future = await createActiveWalletBooking(server.baseUrl, { ...options, actors: requested.fixture.actors });
    const disputed = await createActiveWalletBooking(server.baseUrl, { ...options, actors: requested.fixture.actors });
    const locked = await createActiveWalletBooking(server.baseUrl, { ...options, actors: requested.fixture.actors });
    const now = Date.now();
    await setBookingTimes(String(requested.booking._id), new Date(now + 2 * 60 * 60 * 1_000), new Date(now + 3 * 60 * 60 * 1_000));
    await accept(server.baseUrl, String(protectedBooking.booking._id), protectedBooking.creatorToken);
    await setBookingTimes(String(protectedBooking.booking._id), new Date(now + 12 * 60 * 60 * 1_000), new Date(now + 13 * 60 * 60 * 1_000));
    await accept(server.baseUrl, String(future.booking._id), future.creatorToken);
    await setBookingTimes(String(future.booking._id), new Date(now + 30 * 60 * 60 * 1_000), new Date(now + 31 * 60 * 60 * 1_000));
    await Dispute.create({ bookingId: disputed.booking._id, raisedBy: requested.fixture.actors.userId, raisedByRole: "USER", reason: "Open dispute" });
    const lockedBooking = await Booking.findById(locked.booking._id).orFail();
    lockedBooking.isFinancialLocked = true;
    await lockedBooking.save();

    const result = await triggerSuspensionLifecycle({ adminId: String(requested.fixture.actors.adminId), userId: String(requested.fixture.actors.userId), reason: "G3 test suspension" });
    assert.equal(result.consequences.terminatedCount, 2);
    assert.equal(result.consequences.protectedCount, 1);
    assert.equal(result.consequences.disputeLockedCount, 1);
    assert.equal(result.consequences.financialLockedCount, 1);
    assert.equal((await Booking.findById(requested.booking._id).orFail()).status, "CANCELLED");
    assert.equal((await Booking.findById(future.booking._id).orFail()).status, "CANCELLED");
    assert.equal((await Booking.findById(protectedBooking.booking._id).orFail()).status, "CONFIRMED");
    assert.equal((await Booking.findById(disputed.booking._id).orFail()).status, "REQUESTED");
    assert.equal((await Booking.findById(locked.booking._id).orFail()).status, "REQUESTED");
    const wallet = await Wallet.findById(requested.fixture.actors.wallet._id).orFail();
    assert.equal(wallet.reservedBalance, 315_000);
    assert.equal(await LedgerEntry.countDocuments({ source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 4);
    const replay = await triggerSuspensionLifecycle({ adminId: String(requested.fixture.actors.adminId), userId: String(requested.fixture.actors.userId), reason: "replay" });
    assert.equal(replay.consequences.terminatedCount, 0);
    assert.equal(await LedgerEntry.countDocuments({ source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 4);
  } finally { await server.close(); }
});

test("G3 ban applies the same customer/creator timing policy and protects the exact 24-hour boundary", async () => {
  const server = await startReleaseHttpServer();
  try {
    const first = await createActiveWalletBooking(server.baseUrl, { walletAmount: 400_000, slotAmounts: [100_000] });
    const boundary = await createActiveWalletBooking(server.baseUrl, { walletAmount: 400_000, slotAmounts: [100_000], actors: first.fixture.actors });
    const later = await createActiveWalletBooking(server.baseUrl, { walletAmount: 400_000, slotAmounts: [100_000], actors: first.fixture.actors });
    const now = Date.now();
    await accept(server.baseUrl, String(boundary.booking._id), boundary.creatorToken);
    await setBookingTimes(String(boundary.booking._id), new Date(now + 24 * 60 * 60 * 1_000), new Date(now + 25 * 60 * 60 * 1_000));
    await accept(server.baseUrl, String(later.booking._id), later.creatorToken);
    await setBookingTimes(String(later.booking._id), new Date(now + 24 * 60 * 60 * 1_000 + 1), new Date(now + 25 * 60 * 60 * 1_000));
    const result = await triggerBanLifecycle({ adminId: String(first.fixture.actors.adminId), userId: String(first.fixture.actors.creatorId), reason: "G3 creator ban", now: new Date(now) });
    assert.equal(result.consequences.terminatedCount, 2);
    assert.equal(result.consequences.protectedCount, 1);
    assert.equal((await Booking.findById(first.booking._id).orFail()).status, "CANCELLED");
    assert.equal((await Booking.findById(boundary.booking._id).orFail()).status, "CONFIRMED");
    assert.equal((await Booking.findById(later.booking._id).orFail()).status, "CANCELLED");
  } finally { await server.close(); }
});

test("G3 protects ongoing confirmed sessions and treats captured reservations as financial locks", async () => {
  const server = await startReleaseHttpServer();
  try {
    const ongoing = await createActiveWalletBooking(server.baseUrl, { walletAmount: 300_000, slotAmounts: [100_000] });
    const captured = await createActiveWalletBooking(server.baseUrl, { walletAmount: 300_000, slotAmounts: [100_000], actors: ongoing.fixture.actors });
    await accept(server.baseUrl, String(ongoing.booking._id), ongoing.creatorToken);
    await setBookingTimes(String(ongoing.booking._id), new Date(Date.now() - 30 * 60 * 1_000), new Date(Date.now() + 30 * 60 * 1_000));
    const reservation = await BookingFundReservation.findOne({ bookingId: captured.booking._id }).orFail();
    reservation.status = BookingFundReservationStatus.CAPTURED;
    await reservation.save();
    const payment = await Payment.findById(captured.booking.paymentId).orFail();
    payment.status = PaymentStatus.CAPTURED;
    await payment.save();
    const result = await triggerSuspensionLifecycle({ adminId: String(ongoing.fixture.actors.adminId), userId: String(ongoing.fixture.actors.creatorId), reason: "G3 ongoing" });
    assert.equal(result.consequences.protectedCount, 1);
    assert.equal(result.consequences.financialLockedCount, 1);
    assert.equal((await Booking.findById(ongoing.booking._id).orFail()).status, "CONFIRMED");
    assert.equal((await Booking.findById(captured.booking._id).orFail()).status, "REQUESTED");
  } finally { await server.close(); }
});
