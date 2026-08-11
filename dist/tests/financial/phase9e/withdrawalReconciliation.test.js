"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalReconciliationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalReconciliationTests = () => {
    (0, node_test_1.test)("phase9e persists deterministic pending-success reconciliation", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            const result = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, fixture.fixture.actors.adminId.toString());
            strict_1.default.equal(result.classification, "FINALIZATION_PENDING_SUCCESS");
            strict_1.default.equal(result.status, "OPEN");
            strict_1.default.equal(result.allowedActions.includes("RETRY_FINALIZATION"), true);
            strict_1.default.equal(await creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.countDocuments(), 1);
            strict_1.default.deepEqual(await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id), before);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalReconciliationTests = registerWithdrawalReconciliationTests;
