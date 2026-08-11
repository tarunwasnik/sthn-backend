"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingAllocationSettlement_orchestrator_1 = require("../../../services/financial/bookingAllocationSettlement.orchestrator");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const registerBookingCreatorSettlementReplayTests = () => {
    (0, node_test_1.test)("phase8e service, orchestrator, model reload, and validation replay preserve one effect", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const first = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            const before = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({
                bookingId: fixture.booking._id,
            }).select("+settlementKey +settlementTransactionId " +
                "+settlementProjectionOperationReference +settlementLedgerEntryIds " +
                "+settlementFingerprint").orFail();
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const second = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            const orchestrated = await bookingAllocationSettlement_orchestrator_1.bookingAllocationSettlementOrchestrator.allocateAndSettle(fixture.booking._id.toString());
            const validated = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(fixture.booking._id.toString());
            const after = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findById(before._id).select("+settlementKey +settlementTransactionId " +
                "+settlementProjectionOperationReference +settlementLedgerEntryIds " +
                "+settlementFingerprint").orFail();
            strict_1.default.equal(first.replay, false);
            strict_1.default.equal(second.replay, true);
            strict_1.default.equal(orchestrated.replay, true);
            strict_1.default.equal(validated.replay, true);
            strict_1.default.equal(after.settlementReference, before.settlementReference);
            strict_1.default.equal(after.settlementKey, before.settlementKey);
            strict_1.default.equal(after.settlementTransactionId, before.settlementTransactionId);
            strict_1.default.equal(after.settlementProjectionOperationReference, before.settlementProjectionOperationReference);
            strict_1.default.deepEqual(after.settlementLedgerEntryIds, before.settlementLedgerEntryIds);
            strict_1.default.equal(after.settledAt?.getTime(), before.settledAt?.getTime());
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
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementReplayTests = registerBookingCreatorSettlementReplayTests;
