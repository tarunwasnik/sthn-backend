"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalRetryTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const creatorWithdrawalFinalizationRetry_service_1 = require("../../../services/financial/creatorWithdrawalFinalizationRetry.service");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalRetryTests = () => {
    (0, node_test_1.test)("phase9e retries pending success and failure only through Phase 9D", async () => {
        for (const [outcome, terminal, healthy] of [
            [withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS, "COMPLETED", "HEALTHY_COMPLETED"],
            [withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE, "FAILED", "HEALTHY_FAILED"],
        ]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, outcome);
                const adminId = fixture.fixture.actors.adminId.toString();
                const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
                const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
                const retried = await creatorWithdrawalFinalizationRetry_service_1.creatorWithdrawalFinalizationRetryService.retry(reconciliation.reconciliationReference, adminId);
                strict_1.default.equal(retried.classification, healthy);
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).orFail();
                strict_1.default.equal(withdrawal.status, terminal);
                const after = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
                strict_1.default.equal(after.ledgerCount, before.ledgerCount + 2);
                strict_1.default.equal(after.projectionCount, before.projectionCount + 1);
                strict_1.default.equal(after.terminalAuditCount, before.terminalAuditCount + 1);
                if (outcome === withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS) {
                    strict_1.default.equal(after.wallet.currentBalance, before.wallet.currentBalance - fixture.withdrawal.amount);
                }
                else {
                    strict_1.default.equal(after.wallet.currentBalance, before.wallet.currentBalance);
                    strict_1.default.equal(after.wallet.availableBalance, before.wallet.availableBalance + fixture.withdrawal.amount);
                }
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerWithdrawalRetryTests = registerWithdrawalRetryTests;
