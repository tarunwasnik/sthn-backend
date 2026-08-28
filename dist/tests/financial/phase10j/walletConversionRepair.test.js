"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRepairTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRepairOperation_model_1 = require("../../../models/walletConversionRepairOperation.model");
const walletConversionRepairAction_enum_1 = require("../../../enums/financial/walletConversionRepairAction.enum");
const walletConversionRepair_service_1 = require("../../../services/financial/walletConversionRepair.service");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
const registerRepairTests = () => {
    (0, node_test_1.test)("phase10j repair restores exactly one missing audit", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.removeCompletionAudit)(fixture.conversionReference);
        const before = await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference);
        const reconciled = await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        strict_1.default.equal(reconciled.classification, "MISSING_AUDIT");
        strict_1.default.deepEqual(reconciled.allowedActions, [
            walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT,
        ]);
        const result = await walletConversionRepair_service_1.walletConversionRepairService.repair(fixture.conversionReference, walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId);
        strict_1.default.equal(result.classification, "HEALTHY");
        strict_1.default.equal(result.repairPerformed, true);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: fixture.conversionReference,
            action: "WALLET_CONVERSION_COMPLETED",
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference), before);
    });
    (0, node_test_1.test)("phase10j repair restores a missing Ledger reference only", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.removeLedgerReference)(fixture.conversionReference);
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        const result = await walletConversionRepair_service_1.walletConversionRepairService.repair(fixture.conversionReference, walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES, fixture.adminId);
        strict_1.default.equal(result.classification, "HEALTHY");
        strict_1.default.equal(await walletConversionRepairOperation_model_1.WalletConversionRepairOperation.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10j ten repairs produce one repair authority", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.removeCompletionAudit)(fixture.conversionReference);
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        const results = await Promise.all(Array.from({ length: 10 }, () => walletConversionRepair_service_1.walletConversionRepairService.repair(fixture.conversionReference, walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId)));
        strict_1.default.ok(results.every((value) => value.repairPerformed));
        strict_1.default.equal(await walletConversionRepairOperation_model_1.WalletConversionRepairOperation.countDocuments({}), 1);
    });
};
exports.registerRepairTests = registerRepairTests;
