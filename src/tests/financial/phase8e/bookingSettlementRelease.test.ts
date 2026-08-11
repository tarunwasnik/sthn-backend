import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { Booking } from "../../../models/booking.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { Dispute } from "../../../models/dispute.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { AuditLog } from "../../../models/auditLog.model";
import { UserProfile } from "../../../models/userProfile.model";
import { Wallet } from "../../../models/wallet.model";
import { settleBookingsJob } from "../../../jobs/settleBookings.job";
import { adminBookingEscrowService } from "../../../services/financial/adminBookingEscrow.service";
import { bookingSettlementReleaseService } from "../../../services/financial/bookingSettlementRelease.service";
import { createCapturedWalletBooking, startAllocationHttpServer } from "../phase8d/fixtures/bookingEscrowAllocationFixtures";

const verifyCreatorProfile = async (userId: Types.ObjectId, suffix: string) => {
  await UserProfile.create({
    userId,
    username: `phase8e_release_${suffix}`,
    dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    interests: ["finance"],
    bio: "Phase 8E settlement release test",
    avatar: "https://test.local/avatar",
    cover: "https://test.local/cover",
    profilePhotos: ["https://test.local/1", "https://test.local/2"],
    profileStatus: "verified",
  });
};

export const registerBookingSettlementReleaseTests = () => {
  test("phase8e scheduled settlement respects the hold while admin early release uses the same authority once", async () => {
    const server = await startAllocationHttpServer();
    try {
      const fixture = await createCapturedWalletBooking(server.baseUrl);
      await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
      await Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() + 60_000) } });
      const held = await adminBookingEscrowService.get(fixture.booking.bookingReference!);
      assert.equal(held.escrowState, "HELD");
      assert.equal(held.manualReleaseAllowed, true);
      assert.equal("_id" in held, false);
      const scheduled = await settleBookingsJob();
      assert.equal(scheduled.processed, 0);
      const first = await bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString(), reason: "Bounded test release" });
      const replay = await bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString(), reason: "Bounded test release" });
      assert.equal(first.replay, false);
      assert.equal(replay.replay, true);
      assert.equal(await BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 1);
      assert.equal(await LedgerEntry.countDocuments({ bookingId: fixture.booking._id, source: "BOOKING_CREATOR_WALLET_SETTLEMENT" }), 2);
      assert.equal(await Wallet.countDocuments({ userId: fixture.fixture.actors.creatorId, currency: "INR" }), 1);
      assert.equal(await AuditLog.countDocuments({ action: AuditAction.ADMIN_BOOKING_ESCROW_MANUAL_RELEASED }), 1);
      const settled = await adminBookingEscrowService.get(fixture.booking.bookingReference!);
      assert.equal(settled.escrowState, "SETTLED");
      assert.equal(settled.manualReleaseAllowed, false);
    } finally { await server.close(); }
  });

  test("phase8e scheduled settlement uses the authoritative release path after eligibility", async () => {
    const server = await startAllocationHttpServer();
    try {
      const fixture = await createCapturedWalletBooking(server.baseUrl);
      await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
      await Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() - 1_000) } });
      const report = await settleBookingsJob();
      assert.equal(report.completed, 1);
      assert.equal(await BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 1);
    } finally { await server.close(); }
  });

  test("phase8e open disputes block manual and scheduled settlement release", async () => {
    const server = await startAllocationHttpServer();
    try {
      const fixture = await createCapturedWalletBooking(server.baseUrl);
      await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
      await Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() - 1_000) } });
      await Dispute.create({ bookingId: fixture.booking._id, raisedBy: fixture.fixture.actors.userId, raisedByRole: "USER", reason: "Settlement safety test", status: "OPEN", slaHours: 48, escalationLevel: "NONE", signals: [] });
      await assert.rejects(bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString() }), { code: "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN" });
      const report = await settleBookingsJob();
      assert.equal(report.blocked, 1);
      assert.equal(await BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 0);
    } finally { await server.close(); }
  });
};
