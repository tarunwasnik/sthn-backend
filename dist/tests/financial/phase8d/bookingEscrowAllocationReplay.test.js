"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingEscrowAllocationReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const bookingEscrowAllocationFixtures_1 = require("./fixtures/bookingEscrowAllocationFixtures");
const registerBookingEscrowAllocationReplayTests = () => {
    (0, node_test_1.test)("phase8d service and model-reload replay preserve one authoritative allocation", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl, {
                walletAmount: 1050,
                slotAmounts: [1000],
            });
            const walletBefore = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            const first = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            const persistedBefore = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
                bookingId: captured.booking._id,
            }).select("+allocationKey +allocationLedgerTransaction " +
                "+allocationLedgerEntryIds +allocationFingerprint").orFail();
            const second = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            const validated = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.validateReplay(captured.booking._id.toString());
            const persistedAfter = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
                bookingId: captured.booking._id,
            }).select("+allocationKey +allocationLedgerTransaction " +
                "+allocationLedgerEntryIds +allocationFingerprint").orFail();
            strict_1.default.equal(first.replay, false);
            strict_1.default.equal(second.replay, true);
            strict_1.default.equal(validated.replay, true);
            strict_1.default.equal(second.allocation.allocationReference, first.allocation.allocationReference);
            strict_1.default.equal(persistedAfter.allocatedAt?.getTime(), persistedBefore.allocatedAt?.getTime());
            strict_1.default.equal(persistedAfter.allocationKey, persistedBefore.allocationKey);
            strict_1.default.equal(persistedAfter.allocationLedgerTransaction, persistedBefore.allocationLedgerTransaction);
            strict_1.default.deepEqual(persistedAfter.allocationLedgerEntryIds, persistedBefore.allocationLedgerEntryIds);
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({
                bookingId: captured.booking._id,
            }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: captured.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 4);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
                entityId: persistedAfter._id,
            }), 1);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), projectionCount);
            const walletAfter = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingEscrowAllocationReplayTests = registerBookingEscrowAllocationReplayTests;
