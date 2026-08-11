"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalRepairTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../../enums/financial/creatorWithdrawalOperationalAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalRepair_service_1 = require("../../../services/financial/creatorWithdrawalRepair.service");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalRepairTests = () => {
    (0, node_test_1.test)("phase9e restores only proven missing finalization links idempotently", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }, { $set: { finalizationLedgerEntryIds: [] } });
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            strict_1.default.equal(reconciliation.classification, "MISSING_FINALIZATION_LINKS");
            const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            const first = await creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId);
            const second = await creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId);
            strict_1.default.equal(first.repairReference, second.repairReference);
            strict_1.default.equal(second.replay, true);
            const after = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            strict_1.default.deepEqual(after.wallet, before.wallet);
            strict_1.default.equal(after.ledgerCount, before.ledgerCount);
            strict_1.default.equal(after.projectionCount, before.projectionCount);
            strict_1.default.equal(after.terminalAuditCount, before.terminalAuditCount);
            strict_1.default.equal(after.withdrawal.status, before.withdrawal.status);
            strict_1.default.equal(after.withdrawal.amount, before.withdrawal.amount);
            strict_1.default.equal(after.withdrawal.currency, before.withdrawal.currency);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e restores one missing terminal audit without financial mutation", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE);
            await auditLog_model_1.AuditLog.deleteOne({ action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED });
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            strict_1.default.equal(reconciliation.classification, "MISSING_AUDIT");
            const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            await creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT, adminId);
            const after = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            strict_1.default.equal(after.ledgerCount, before.ledgerCount);
            strict_1.default.equal(after.projectionCount, before.projectionCount);
            strict_1.default.deepEqual(after.wallet, before.wallet);
            strict_1.default.equal(after.terminalAuditCount, 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalRepairTests = registerWithdrawalRepairTests;
