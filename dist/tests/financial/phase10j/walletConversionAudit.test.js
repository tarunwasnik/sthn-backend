"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuditTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRepairAction_enum_1 = require("../../../enums/financial/walletConversionRepairAction.enum");
const walletConversionRepair_service_1 = require("../../../services/financial/walletConversionRepair.service");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
const registerAuditTests = () => {
    (0, node_test_1.test)("phase10j operational audit uses bounded safe metadata", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        await (0, walletConversionOperationalFixtures_1.removeCompletionAudit)(fixture.conversionReference);
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        await walletConversionRepair_service_1.walletConversionRepairService.repair(fixture.conversionReference, walletConversionRepairAction_enum_1.WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId);
        const audits = await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference: fixture.conversionReference,
            action: { $in: ["WALLET_CONVERSION_RECONCILED",
                    "WALLET_CONVERSION_REPAIRED"] },
        }).lean();
        strict_1.default.equal(audits.length, 2);
        strict_1.default.ok(audits.every((audit) => audit.reconciliationReference &&
            audit.classification && audit.severity &&
            !Object.prototype.hasOwnProperty.call(audit, "accountingFingerprint") &&
            !Object.prototype.hasOwnProperty.call(audit, "walletId") &&
            !Object.prototype.hasOwnProperty.call(audit, "ledgerId")));
    });
};
exports.registerAuditTests = registerAuditTests;
