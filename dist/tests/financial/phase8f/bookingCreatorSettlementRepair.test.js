"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementRepairTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingCreatorSettlementReconciliation_enum_1 = require("../../../enums/financial/bookingCreatorSettlementReconciliation.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingCreatorSettlementRepairOperation_model_1 = require("../../../models/bookingCreatorSettlementRepairOperation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingCreatorSettlementReconciliation_service_1 = require("../../../services/financial/bookingCreatorSettlementReconciliation.service");
const bookingCreatorSettlementRepair_service_1 = require("../../../services/financial/bookingCreatorSettlementRepair.service");
const bookingCreatorSettlementOperationalFixtures_1 = require("./fixtures/bookingCreatorSettlementOperationalFixtures");
const registerBookingCreatorSettlementRepairTests = () => {
    (0, node_test_1.test)("phase8f missing audit repair is bounded, idempotent, and financially read-only", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await auditLog_model_1.AuditLog.deleteOne({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                entityId: fixture.settlement._id,
            });
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const ledgerCount = await ledgerEntry_model_1.LedgerEntry.countDocuments();
            const first = await bookingCreatorSettlementRepair_service_1.bookingCreatorSettlementRepairService.repair(reconciliation.reconciliationReference, bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_MISSING_AUDIT, fixture.fixture.actors.adminId.toString());
            const replay = await bookingCreatorSettlementRepair_service_1.bookingCreatorSettlementRepairService.repair(reconciliation.reconciliationReference, bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_MISSING_AUDIT, fixture.fixture.actors.adminId.toString());
            strict_1.default.equal(first.operationReference, replay.operationReference);
            strict_1.default.equal(await bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.countDocuments(), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                entityId: fixture.settlement._id,
            }), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_REPAIRED,
            }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments(), ledgerCount);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f concurrent replay-metadata repairs converge on one operation", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
                _id: fixture.settlement._id,
            }, { $set: { settlementLedgerEntryIds: [] } });
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => bookingCreatorSettlementRepair_service_1.bookingCreatorSettlementRepairService.repair(reconciliation.reconciliationReference, bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_REPLAY_METADATA, fixture.fixture.actors.adminId.toString())));
            strict_1.default.ok(attempts.every((item) => item.status === "fulfilled"), attempts.map((item) => item.status === "fulfilled"
                ? "fulfilled" : String(item.reason)).join(" | "));
            strict_1.default.equal(await bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.countDocuments(), 1);
            const repaired = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findById(fixture.settlement._id).select("+settlementLedgerEntryIds").orFail();
            strict_1.default.equal(repaired.settlementLedgerEntryIds.length, 2);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f forbids repair of corrupted accounting", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                transactionId: fixture.settlement.settlementTransactionId,
                account: "CREATOR_PAYABLE",
            }, { $set: { amount: 799 } });
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            await strict_1.default.rejects(bookingCreatorSettlementRepair_service_1.bookingCreatorSettlementRepairService.repair(reconciliation.reconciliationReference, bookingCreatorSettlementReconciliation_enum_1.BookingCreatorSettlementRepairAction.RESTORE_REPLAY_METADATA, fixture.fixture.actors.adminId.toString()));
            strict_1.default.equal(await bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementRepairTests = registerBookingCreatorSettlementRepairTests;
