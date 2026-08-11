"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReleaseReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingWalletReleaseCause_enum_1 = require("../../../enums/financial/bookingWalletReleaseCause.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingWalletReservationRelease_service_1 = require("../../../services/financial/bookingWalletReservationRelease.service");
const bookingWalletReleaseFixtures_1 = require("./fixtures/bookingWalletReleaseFixtures");
const releaseCounts = async (bookingId) => ({
    ledger: await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
    }),
    projection: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
        "metadata.bookingId": bookingId,
        "deltas.reservedBalance": { $lt: 0 },
    }),
    audit: await auditLog_model_1.AuditLog.countDocuments({
        action: "BOOKING_WALLET_RESERVATION_RELEASED",
    }),
});
const registerBookingWalletReleaseReplayTests = () => {
    (0, node_test_1.test)("phase8b Creator rejection endpoint and service replay preserve release authority", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { booking, creatorToken } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
            const first = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT");
            strict_1.default.equal(first.status, 200, JSON.stringify(first.body));
            const persisted = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id })
                .select("+releaseKey +releaseTransactionId +releaseProjectionOperationReference")
                .orFail();
            const authority = {
                reference: persisted.releaseReference,
                key: persisted.releaseKey,
                transaction: persisted.releaseTransactionId,
                projection: persisted.releaseProjectionOperationReference,
                releasedAt: persisted.releasedAt?.getTime(),
            };
            const second = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "REJECT");
            strict_1.default.equal(second.status, 200, JSON.stringify(second.body));
            strict_1.default.equal(second.body.replay, true);
            const serviceReplay = await bookingWalletReservationRelease_service_1.bookingWalletReservationReleaseService.validateReplay({
                bookingId: booking._id,
                cause: bookingWalletReleaseCause_enum_1.BookingWalletReleaseCause.CREATOR_REJECTED,
            });
            strict_1.default.equal(serviceReplay.replay, true);
            strict_1.default.equal(serviceReplay.reservation.releaseReference, authority.reference);
            strict_1.default.equal(serviceReplay.reservation.releasedAt.getTime(), authority.releasedAt);
            const reloaded = await bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id })
                .select("+releaseKey +releaseTransactionId +releaseProjectionOperationReference")
                .orFail();
            strict_1.default.deepEqual({
                reference: reloaded.releaseReference,
                key: reloaded.releaseKey,
                transaction: reloaded.releaseTransactionId,
                projection: reloaded.releaseProjectionOperationReference,
                releasedAt: reloaded.releasedAt?.getTime(),
            }, authority);
            strict_1.default.deepEqual(await releaseCounts(booking._id.toString()), {
                ledger: 2,
                projection: 0,
                audit: 1,
            });
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8b cancellation endpoint replay performs no duplicate financial effect", async () => {
        const server = await (0, bookingWalletReleaseFixtures_1.startReleaseHttpServer)();
        try {
            const { fixture, booking } = await (0, bookingWalletReleaseFixtures_1.createActiveWalletBooking)(server.baseUrl, { walletAmount: 1000, slotAmounts: [250] });
            const first = await (0, bookingWalletReleaseFixtures_1.postUserCancellation)(server.baseUrl, booking._id.toString(), fixture);
            const second = await (0, bookingWalletReleaseFixtures_1.postUserCancellation)(server.baseUrl, booking._id.toString(), fixture);
            strict_1.default.equal(first.status, 200, JSON.stringify(first.body));
            strict_1.default.equal(second.status, 200, JSON.stringify(second.body));
            strict_1.default.equal(second.body.replay, true);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_RESERVATION_RELEASE,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: fixture.actors.wallet._id,
                "deltas.reservedBalance": -263,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReleaseReplayTests = registerBookingWalletReleaseReplayTests;
