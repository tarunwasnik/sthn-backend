"use strict";
/// <reference path="../../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const marketplacePricing_service_1 = require("../../../services/financial/marketplacePricing.service");
const database_1 = require("../phase7h/helpers/database");
const marketplaceFixtures_1 = require("../phase10a/fixtures/marketplaceFixtures");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10b-test-jwt-secret";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const accountBalance = async (account) => {
    const entries = await ledgerEntry_model_1.LedgerEntry.find({ account });
    return entries.reduce((sum, entry) => sum +
        (entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT ? entry.amount : -entry.amount), 0);
};
(0, node_test_1.test)("phase10b central pricing produces the immutable 5/20 marketplace split", () => {
    strict_1.default.deepEqual(marketplacePricing_service_1.marketplacePricingService.calculate({
        serviceAmount: 1000,
        currency: "INR",
    }), {
        serviceAmount: 1000,
        platformFeeAmount: 50,
        commissionAmount: 200,
        creatorAmount: 800,
        totalAmount: 1050,
        currency: "INR",
    });
    for (const field of ["serviceAmount", "platformFeeAmount", "totalAmount",
        "currency"]) {
        strict_1.default.equal(booking_model_1.Booking.schema.path(field).options.immutable, true);
    }
});
(0, node_test_1.test)("phase10b exact-funded marketplace flow pays 1050 and preserves Creator earnings", async () => {
    const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)({
        customerTopUpAmount: 1050,
    });
    try {
        strict_1.default.deepEqual(flow.walletTimeline.customerAfterReservation, { available: 0, reserved: 1050, locked: 0, total: 1050,
            version: 2 });
        strict_1.default.deepEqual(flow.walletTimeline.customerAfterCapture, { available: 0, reserved: 0, locked: 0, total: 0, version: 3 });
        strict_1.default.deepEqual(flow.walletTimeline.creatorAfterSettlement, { available: 800, reserved: 0, locked: 0, total: 800, version: 1 });
        strict_1.default.equal(flow.booking.serviceAmount, 1000);
        strict_1.default.equal(flow.booking.platformFeeAmount, 50);
        strict_1.default.equal(flow.booking.commissionAmount, 200);
        strict_1.default.equal(flow.booking.creatorAmount, 800);
        strict_1.default.equal(flow.booking.totalAmount, 1050);
        strict_1.default.equal(flow.payment.amount, 1050);
        strict_1.default.equal(flow.reservation.amount, 1050);
        strict_1.default.equal(flow.allocation.serviceAmount, 1000);
        strict_1.default.equal(flow.allocation.platformFeeAmount, 50);
        strict_1.default.equal(flow.allocation.totalAmount, 1050);
        strict_1.default.equal(flow.allocation.commissionAmount, 200);
        strict_1.default.equal(flow.allocation.creatorAmount, 800);
        strict_1.default.equal(await accountBalance(ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW), 0);
        strict_1.default.equal(await accountBalance(ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE), 200);
        strict_1.default.equal(await accountBalance(ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE), 50);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
        }), 4);
        strict_1.default.equal(flow.withdrawalInput.amount.amount, 800);
        strict_1.default.equal(flow.withdrawalFinalized.status, "COMPLETED");
    }
    finally {
        await flow.server.close();
    }
});
(0, node_test_1.test)("phase10b replay and ten-way concurrency create no duplicate effects", async () => {
    const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)({
        customerTopUpAmount: 1050,
    });
    try {
        const before = await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)();
        const attempts = await Promise.all(Array.from({ length: 10 }, () => (0, marketplaceFixtures_1.replaySuccessfulMarketplaceFlow)(flow)));
        strict_1.default.deepEqual(await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)(), before);
        strict_1.default.ok(attempts.every((result) => result.allocation.replay && result.settlement.replay));
        strict_1.default.equal(new Set(attempts.map((result) => result.allocation.allocation.allocationReference)).size, 1);
    }
    finally {
        await flow.server.close();
    }
});
(0, node_test_1.test)("phase10b safe DTOs and allocation audit expose pricing without authority IDs", async () => {
    const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)({
        customerTopUpAmount: 1050,
    });
    try {
        strict_1.default.deepEqual({
            serviceAmount: flow.allocationResult.allocation.serviceAmount,
            platformFeeAmount: flow.allocationResult.allocation.platformFeeAmount,
            totalAmount: flow.allocationResult.allocation.totalAmount,
            commissionAmount: flow.allocationResult.allocation.commissionAmount,
            creatorAmount: flow.allocationResult.allocation.creatorAmount,
        }, { serviceAmount: 1000, platformFeeAmount: 50, totalAmount: 1050,
            commissionAmount: 200, creatorAmount: 800 });
        strict_1.default.equal("allocationLedgerTransaction" in
            flow.allocationResult.allocation, false);
        strict_1.default.deepEqual({
            serviceAmount: flow.settlementResult.settlement.serviceAmount,
            platformFeeAmount: flow.settlementResult.settlement.platformFeeAmount,
            totalAmount: flow.settlementResult.settlement.totalAmount,
            commissionAmount: flow.settlementResult.settlement.commissionAmount,
            creatorAmount: flow.settlementResult.settlement.creatorAmount,
        }, { serviceAmount: 1000, platformFeeAmount: 50, totalAmount: 1050,
            commissionAmount: 200, creatorAmount: 800 });
        const allocation = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
            bookingId: flow.booking._id,
        }).orFail();
        const audit = await auditLog_model_1.AuditLog.findOne({
            action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
            entityId: allocation._id,
        }).orFail();
        strict_1.default.deepEqual({
            serviceAmount: audit.metadata?.serviceAmount,
            platformFeeAmount: audit.metadata?.platformFeeAmount,
            totalAmount: audit.metadata?.totalAmount,
            commissionAmount: audit.metadata?.commissionAmount,
            creatorAmount: audit.metadata?.creatorAmount,
        }, { serviceAmount: 1000, platformFeeAmount: 50, totalAmount: 1050,
            commissionAmount: 200, creatorAmount: 800 });
        strict_1.default.equal("ledgerEntryIds" in (audit.metadata ?? {}), false);
        strict_1.default.equal(await payment_model_1.Payment.countDocuments(), 1);
    }
    finally {
        await flow.server.close();
    }
});
