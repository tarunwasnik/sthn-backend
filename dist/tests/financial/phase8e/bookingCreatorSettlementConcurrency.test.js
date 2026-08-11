"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const registerBookingCreatorSettlementConcurrencyTests = () => {
    (0, node_test_1.test)("phase8e ten identical concurrent settlements converge on one credit", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const contenders = await Promise.allSettled(Array.from({ length: 10 }, () => bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString())));
            strict_1.default.ok(contenders.every((entry) => entry.status === "fulfilled"), contenders.map((entry) => entry.status === "fulfilled"
                ? "fulfilled"
                : `${entry.reason?.code}:${entry.reason?.message}`).join(" | "));
            const fulfilled = contenders.filter((entry) => entry.status === "fulfilled");
            strict_1.default.equal(fulfilled.filter((entry) => entry.value.replay === false).length, 1);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments(), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: fixture.creatorWallet._id,
            }), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
            }), 1);
            const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.deepEqual([
                wallet.availableBalance,
                wallet.reservedBalance,
                wallet.lockedBalance,
                wallet.currentBalance,
            ], [900, 0, 0, 900]);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e distinct concurrent settlements into one Creator Wallet avoid lost updates", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const first = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, { bookingAmount: 1000, creatorWalletAmount: 100 });
            const second = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, {
                bookingAmount: 500,
                customerWalletAmount: 525,
                actors: first.fixture.actors,
            });
            strict_1.default.equal(second.creatorWallet._id.toString(), first.creatorWallet._id.toString());
            const attempts = await Promise.allSettled([
                bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(first.booking._id.toString()),
                bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(second.booking._id.toString()),
            ]);
            strict_1.default.ok(attempts.every((entry) => entry.status === "fulfilled"), attempts.map((entry) => entry.status === "fulfilled"
                ? "fulfilled"
                : String(entry.reason)).join(" | "));
            const wallet = await wallet_model_1.Wallet.findById(first.creatorWallet._id).orFail();
            strict_1.default.deepEqual([
                wallet.availableBalance,
                wallet.reservedBalance,
                wallet.lockedBalance,
                wallet.currentBalance,
            ], [1300, 0, 0, 1300]);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments(), 2);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            }), 4);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: wallet._id,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementConcurrencyTests = registerBookingCreatorSettlementConcurrencyTests;
