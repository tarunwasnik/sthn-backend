"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingSettlementReleaseTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const booking_model_1 = require("../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const dispute_model_1 = require("../../../models/dispute.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const auditLog_model_1 = require("../../../models/auditLog.model");
const userProfile_model_1 = require("../../../models/userProfile.model");
const wallet_model_1 = require("../../../models/wallet.model");
const settleBookings_job_1 = require("../../../jobs/settleBookings.job");
const adminBookingEscrow_service_1 = require("../../../services/financial/adminBookingEscrow.service");
const bookingSettlementRelease_service_1 = require("../../../services/financial/bookingSettlementRelease.service");
const bookingEscrowAllocationFixtures_1 = require("../phase8d/fixtures/bookingEscrowAllocationFixtures");
const verifyCreatorProfile = async (userId, suffix) => {
    await userProfile_model_1.UserProfile.create({
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
const registerBookingSettlementReleaseTests = () => {
    (0, node_test_1.test)("phase8e scheduled settlement respects the hold while admin early release uses the same authority once", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const fixture = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
            await booking_model_1.Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() + 60000) } });
            const held = await adminBookingEscrow_service_1.adminBookingEscrowService.get(fixture.booking.bookingReference);
            strict_1.default.equal(held.escrowState, "HELD");
            strict_1.default.equal(held.manualReleaseAllowed, true);
            strict_1.default.equal("_id" in held, false);
            const scheduled = await (0, settleBookings_job_1.settleBookingsJob)();
            strict_1.default.equal(scheduled.processed, 0);
            const first = await bookingSettlementRelease_service_1.bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString(), reason: "Bounded test release" });
            const replay = await bookingSettlementRelease_service_1.bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString(), reason: "Bounded test release" });
            strict_1.default.equal(first.replay, false);
            strict_1.default.equal(replay.replay, true);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: fixture.booking._id, source: "BOOKING_CREATOR_WALLET_SETTLEMENT" }), 2);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.fixture.actors.creatorId, currency: "INR" }), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: auditAction_enum_1.AuditAction.ADMIN_BOOKING_ESCROW_MANUAL_RELEASED }), 1);
            const settled = await adminBookingEscrow_service_1.adminBookingEscrowService.get(fixture.booking.bookingReference);
            strict_1.default.equal(settled.escrowState, "SETTLED");
            strict_1.default.equal(settled.manualReleaseAllowed, false);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e scheduled settlement uses the authoritative release path after eligibility", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const fixture = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
            await booking_model_1.Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() - 1000) } });
            const report = await (0, settleBookings_job_1.settleBookingsJob)();
            strict_1.default.equal(report.completed, 1);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e open disputes block manual and scheduled settlement release", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const fixture = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await verifyCreatorProfile(fixture.fixture.actors.creatorId, fixture.booking._id.toString());
            await booking_model_1.Booking.updateOne({ _id: fixture.booking._id }, { $set: { settlementEligibleAt: new Date(Date.now() - 1000) } });
            await dispute_model_1.Dispute.create({ bookingId: fixture.booking._id, raisedBy: fixture.fixture.actors.userId, raisedByRole: "USER", reason: "Settlement safety test", status: "OPEN", slaHours: 48, escalationLevel: "NONE", signals: [] });
            await strict_1.default.rejects(bookingSettlementRelease_service_1.bookingSettlementReleaseService.release({ bookingId: fixture.booking._id.toString(), trigger: "ADMIN_EARLY_RELEASE", adminUserId: fixture.fixture.actors.adminId.toString() }), { code: "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN" });
            const report = await (0, settleBookings_job_1.settleBookingsJob)();
            strict_1.default.equal(report.blocked, 1);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({ bookingId: fixture.booking._id }), 0);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingSettlementReleaseTests = registerBookingSettlementReleaseTests;
