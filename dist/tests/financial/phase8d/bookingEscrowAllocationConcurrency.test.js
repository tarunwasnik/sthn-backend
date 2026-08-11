"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingEscrowAllocationConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingEscrowAllocationStatus_enum_1 = require("../../../enums/financial/bookingEscrowAllocationStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const bookingEscrowAllocationFixtures_1 = require("./fixtures/bookingEscrowAllocationFixtures");
const registerBookingEscrowAllocationConcurrencyTests = () => {
    (0, node_test_1.test)("phase8d ten identical concurrent allocations converge on one record, transaction, and audit", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl, {
                walletAmount: 1050,
                slotAmounts: [1000],
            });
            const walletBefore = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            const contenders = await Promise.allSettled(Array.from({ length: 10 }, () => bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString())));
            strict_1.default.ok(contenders.every((entry) => entry.status === "fulfilled"), contenders.map((entry) => entry.status === "fulfilled"
                ? "fulfilled"
                : String(entry.reason)).join(" | "));
            const fulfilled = contenders.filter((entry) => entry.status === "fulfilled");
            strict_1.default.equal(fulfilled.filter((entry) => entry.value.replay === false).length, 1);
            const allocation = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
                bookingId: captured.booking._id,
            }).orFail();
            strict_1.default.equal(allocation.status, bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED);
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: captured.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 4);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
                entityId: allocation._id,
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
exports.registerBookingEscrowAllocationConcurrencyTests = registerBookingEscrowAllocationConcurrencyTests;
