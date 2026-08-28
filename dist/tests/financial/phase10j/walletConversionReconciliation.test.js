"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReconciliationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionReconciliation_model_1 = require("../../../models/walletConversionReconciliation.model");
const walletConversionReconciliation_service_1 = require("../../../services/financial/walletConversionReconciliation.service");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
const registerReconciliationTests = () => {
    (0, node_test_1.test)("phase10j reconciliation classifies a healthy full graph", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const result = await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        strict_1.default.deepEqual(Object.keys(result).sort(), ["allowedActions",
            "classification", "conversionReference", "issues",
            "reconciliationReference", "repairPerformed", "retryPerformed",
            "severity"].sort());
        strict_1.default.match(result.reconciliationReference, /^WCR-[A-F0-9]{20}$/);
        strict_1.default.deepEqual(result.allowedActions, []);
        strict_1.default.equal(result.classification, "HEALTHY");
        strict_1.default.equal(result.severity, "INFO");
        strict_1.default.deepEqual(result.issues, []);
        strict_1.default.equal(await walletConversionReconciliation_model_1.WalletConversionReconciliation.countDocuments({}), 1);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: fixture.conversionReference,
            action: "WALLET_CONVERSION_RECONCILED",
        }), 1);
    });
    (0, node_test_1.test)("phase10j reconciliation replay validates the entire graph", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        const replay = await walletConversionReconciliation_service_1.walletConversionReconciliationService.validateReplay(fixture.conversionReference);
        strict_1.default.equal(replay.classification, "HEALTHY");
        strict_1.default.equal(await walletConversionReconciliation_model_1.WalletConversionReconciliation.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10j ten concurrent reconciliation calls converge", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const results = await Promise.all(Array.from({ length: 10 }, () => fixture.service.reconcile(fixture.conversionReference, fixture.adminId)));
        strict_1.default.ok(results.every((value) => value.classification === "HEALTHY"));
        strict_1.default.equal(await walletConversionReconciliation_model_1.WalletConversionReconciliation.countDocuments({}), 1);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_RECONCILED",
        }), 1);
    });
};
exports.registerReconciliationTests = registerReconciliationTests;
