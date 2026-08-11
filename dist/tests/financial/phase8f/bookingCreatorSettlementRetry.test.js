"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementRetryTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingCreatorSettlementRetryAttempt_model_1 = require("../../../models/bookingCreatorSettlementRetryAttempt.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingCreatorSettlementReconciliation_service_1 = require("../../../services/financial/bookingCreatorSettlementReconciliation.service");
const bookingCreatorSettlementRetry_service_1 = require("../../../services/financial/bookingCreatorSettlementRetry.service");
const bookingCreatorSettlementOperationalFixtures_1 = require("./fixtures/bookingCreatorSettlementOperationalFixtures");
const makeGuardPending = async (fixture) => {
    await bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.updateOne({
        _id: fixture.settlement._id,
    }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } });
    return bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
};
const registerBookingCreatorSettlementRetryTests = () => {
    (0, node_test_1.test)("phase8f concurrent retries apply one PENDING-to-SETTLED guard with no accounting effect", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            const reconciliation = await makeGuardPending(fixture);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const ledgerCount = await ledgerEntry_model_1.LedgerEntry.countDocuments();
            const projectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => bookingCreatorSettlementRetry_service_1.bookingCreatorSettlementRetryService.retry(reconciliation.reconciliationReference)));
            strict_1.default.ok(attempts.every((item) => item.status === "fulfilled"), attempts.map((item) => item.status === "fulfilled"
                ? "fulfilled" : String(item.reason)).join(" | "));
            strict_1.default.equal((await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findById(fixture.settlement._id).orFail()).status, "SETTLED");
            strict_1.default.equal(await bookingCreatorSettlementRetryAttempt_model_1.BookingCreatorSettlementRetryAttempt.countDocuments(), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_SETTLEMENT_RETRIED,
            }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments(), ledgerCount);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), projectionCount);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8f retry rejects a healthy completed settlement", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            const reconciliation = await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            await strict_1.default.rejects(bookingCreatorSettlementRetry_service_1.bookingCreatorSettlementRetryService.retry(reconciliation.reconciliationReference), (error) => {
                strict_1.default.equal(error.code, "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RETRY_NOT_ALLOWED");
                return true;
            });
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementRetryTests = registerBookingCreatorSettlementRetryTests;
