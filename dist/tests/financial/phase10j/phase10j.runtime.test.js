"use strict";
/// <reference path="../../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionReconciliation_model_1 = require("../../../models/walletConversionReconciliation.model");
const walletConversionRepairOperation_model_1 = require("../../../models/walletConversionRepairOperation.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionRetryAttempt_model_1 = require("../../../models/walletConversionRetryAttempt.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionRepairAction_enum_1 = require("../../../enums/financial/walletConversionRepairAction.enum");
const walletConversionReconciliation_service_1 = require("../../../services/financial/walletConversionReconciliation.service");
const walletConversionRepair_service_1 = require("../../../services/financial/walletConversionRepair.service");
const walletConversionRetry_service_1 = require("../../../services/financial/walletConversionRetry.service");
const database_1 = require("../phase7h/helpers/database");
const walletConversionAudit_test_1 = require("./walletConversionAudit.test");
const walletConversionReconciliation_test_1 = require("./walletConversionReconciliation.test");
const walletConversionRegression_test_1 = require("./walletConversionRegression.test");
const walletConversionRepair_test_1 = require("./walletConversionRepair.test");
const walletConversionRetry_test_1 = require("./walletConversionRetry.test");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10j-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([exchangeRateSnapshot_model_1.ExchangeRateSnapshot.init(), wallet_model_1.Wallet.init(),
        ledgerEntry_model_1.LedgerEntry.init(), walletProjectionOperation_model_1.WalletProjectionOperation.init(),
        walletConversionRequest_model_1.WalletConversionRequest.init(), walletConversionAudit_model_1.WalletConversionAudit.init(),
        internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.init(),
        walletConversionReconciliation_model_1.WalletConversionReconciliation.init(),
        walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.init(),
        walletConversionRepairOperation_model_1.WalletConversionRepairOperation.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, walletConversionReconciliation_test_1.registerReconciliationTests)();
(0, walletConversionRetry_test_1.registerRetryTests)();
(0, walletConversionRepair_test_1.registerRepairTests)();
(0, walletConversionAudit_test_1.registerAuditTests)();
(0, walletConversionRegression_test_1.registerRegressionTests)();
(0, node_test_1.test)("phase10j reconciliation rollback boundaries leave no authority", async () => {
    for (const stage of ["AFTER_RECONCILIATION", "BEFORE_AUDIT",
        "BEFORE_COMMIT"]) {
        await (0, database_1.clearPhase7HDatabase)();
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const before = await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference);
        const service = new walletConversionReconciliation_service_1.WalletConversionReconciliationService({
            failureInjector: (current) => {
                if (current === stage)
                    throw new Error(`injected-${stage}`);
            },
        });
        await strict_1.default.rejects(() => service.reconcile(fixture.conversionReference, fixture.adminId));
        strict_1.default.equal(await walletConversionReconciliation_model_1.WalletConversionReconciliation.countDocuments({}), 0);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_RECONCILED",
        }), 0);
        strict_1.default.deepEqual(await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference), before);
    }
});
(0, node_test_1.test)("phase10j retry rollback after retry preserves accounting", async () => {
    const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
    await (0, walletConversionOperationalFixtures_1.makeReplayRequired)(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const before = await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference);
    const service = new walletConversionRetry_service_1.WalletConversionRetryService({
        failureInjector: (stage) => {
            if (stage === "AFTER_RETRY")
                throw new Error("injected-after-retry");
        },
    });
    await strict_1.default.rejects(() => service.retry(fixture.conversionReference, fixture.adminId));
    strict_1.default.equal(await walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.countDocuments({}), 0);
    strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({
        conversionReference: fixture.conversionReference
    }).orFail()).status, "APPROVED");
    strict_1.default.deepEqual(await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference), before);
});
(0, node_test_1.test)("phase10j repair rollback after repair and before commit is atomic", async () => {
    for (const stage of ["AFTER_REPAIR", "BEFORE_COMMIT"]) {
        await (0, database_1.clearPhase7HDatabase)();
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.removeCompletionAudit)(fixture.conversionReference);
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        const before = await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference);
        const service = new walletConversionRepair_service_1.WalletConversionRepairService({
            failureInjector: (current) => {
                if (current === stage)
                    throw new Error(`injected-${stage}`);
            },
        });
        await strict_1.default.rejects(() => service.repair(fixture.conversionReference, walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId));
        strict_1.default.equal(await walletConversionRepairOperation_model_1.WalletConversionRepairOperation.countDocuments({}), 0);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: fixture.conversionReference,
            action: "WALLET_CONVERSION_COMPLETED",
        }), 0);
        strict_1.default.deepEqual(await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference), before);
    }
});
