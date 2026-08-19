/// <reference path="../../types/express.d.ts" />

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { Booking } from "../../models/booking.model";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import { Payment } from "../../models/payment.model";
import { Slot } from "../../models/slot.model";
import { Wallet } from "../../models/wallet.model";
import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { BookingWalletReleaseCause } from "../../enums/financial/bookingWalletReleaseCause.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { bookingFinancialTerminationService } from "../../services/financial/bookingFinancialTermination.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";
import { createActiveWalletBooking, postCreatorDecision, startReleaseHttpServer } from "../financial/phase8b/fixtures/bookingWalletReleaseFixtures";
import { createAcceptedWalletBooking, postCreatorCompletion } from "../financial/phase8c/fixtures/bookingWalletCaptureFixtures";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "governance-g2-test-jwt-secret";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const terminateForGovernance = (bookingId: string, adminId: string) =>
  bookingFinancialTerminationService.terminateBookingFinancially({
    bookingId,
    actorId: adminId,
    actorType: BookingTerminationActorType.GOVERNANCE,
    terminationType: BookingTerminationType.GOVERNANCE_TERMINATED,
    reason: "Governance classified this pre-capture booking for termination.",
  });

const assertGovernanceRelease = async (bookingId: string, walletId: unknown, expectedAmount: number) => {
  const booking = await Booking.findById(bookingId).orFail();
  const [payment, reservation, wallet, slots, entries] = await Promise.all([
    Payment.findOne({ bookingId }).orFail(),
    BookingFundReservation.findOne({ bookingId }).orFail(),
    Wallet.findById(walletId).orFail(),
    Slot.find({ _id: { $in: booking.slotIds } }),
    LedgerEntry.find({ bookingId, source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }),
  ]);
  assert.equal(booking.status, "CANCELLED");
  assert.equal(booking.terminationType, BookingTerminationType.GOVERNANCE_TERMINATED);
  assert.equal(payment.status, PaymentStatus.CANCELLED);
  assert.equal(reservation.status, BookingFundReservationStatus.RELEASED);
  assert.equal(reservation.releaseCause, BookingWalletReleaseCause.GOVERNANCE_TERMINATED);
  assert.equal(wallet.availableBalance, 200_000);
  assert.equal(wallet.reservedBalance, 0);
  assert.equal(wallet.currentBalance, 200_000);
  assert.ok(slots.every((slot) => slot.status === "AVAILABLE"));
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.amount === expectedAmount));
};

test("G2 governance termination releases a REQUESTED Wallet reservation exactly once", async () => {
  const server = await startReleaseHttpServer();
  try {
    const { fixture, booking } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 200_000, slotAmounts: [100_000] });
    const result = await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
    assert.equal(result.financialAction, "RELEASE");
    await assertGovernanceRelease(String(booking._id), fixture.actors.wallet._id, 105_000);
    const replay = await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
    assert.equal(replay.replay, true);
    assert.equal(await LedgerEntry.countDocuments({ bookingId: booking._id, source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 2);
  } finally { await server.close(); }
});

test("G2 governance termination releases an uncaptured CONFIRMED Wallet reservation", async () => {
  const server = await startReleaseHttpServer();
  try {
    const { fixture, booking, creatorToken } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 200_000, slotAmounts: [100_000] });
    const accepted = await postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    await terminateForGovernance(String(booking._id), String(fixture.actors.adminId));
    await assertGovernanceRelease(String(booking._id), fixture.actors.wallet._id, 105_000);
  } finally { await server.close(); }
});

test("G2 governance termination races another termination cause without duplicate Wallet release", async () => {
  const server = await startReleaseHttpServer();
  try {
    const { fixture, booking, creatorToken } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 200_000, slotAmounts: [100_000] });
    const [governance, creator] = await Promise.allSettled([
      terminateForGovernance(String(booking._id), String(fixture.actors.adminId)),
      postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "REJECT"),
    ]);
    assert.ok(governance.status === "fulfilled" || (creator.status === "fulfilled" && creator.value.status === 200));
    const wallet = await Wallet.findById(fixture.actors.wallet._id).orFail();
    assert.equal(wallet.availableBalance, 200_000);
    assert.equal(wallet.reservedBalance, 0);
    assert.equal(await LedgerEntry.countDocuments({ bookingId: booking._id, source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), 2);
  } finally { await server.close(); }
});

test("G2 fails closed after capture and creates no governance release effect", async () => {
  const server = await startReleaseHttpServer();
  try {
    const { fixture, booking, creatorToken } = await createAcceptedWalletBooking(server.baseUrl, { walletAmount: 200_000, slotAmounts: [100_000] });
    const completed = await postCreatorCompletion(server.baseUrl, String(booking._id), creatorToken);
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    const beforeReleaseEntries = await LedgerEntry.countDocuments({ bookingId: booking._id, source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE });
    await assert.rejects(() => terminateForGovernance(String(booking._id), String(fixture.actors.adminId)));
    assert.equal(await LedgerEntry.countDocuments({ bookingId: booking._id, source: LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE }), beforeReleaseEntries);
    const reservation = await BookingFundReservation.findOne({ bookingId: booking._id }).orFail();
    assert.equal(reservation.status, BookingFundReservationStatus.CAPTURED);
  } finally { await server.close(); }
});
