"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalOperationalRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const payoutDestination_model_1 = require("../../../models/payoutDestination.model");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalOperationalRegressionTests = () => {
    (0, node_test_1.test)("phase9e admin endpoint is protected, safe, and verifies operational indexes", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const path = `${server.baseUrl}/api/v1/admin/financial/creator-withdrawals/` +
                `${fixture.withdrawal.withdrawalReference}/reconciliation`;
            strict_1.default.equal((await fetch(path)).status, 401);
            const userResponse = await fetch(path, { headers: { authorization: `Bearer ${(0, creatorWithdrawalOperationalFixtures_1.adminToken)(fixture.fixture.actors.userId.toString())}` } });
            strict_1.default.equal(userResponse.status, 403);
            const creatorResponse = await fetch(path, { headers: { authorization: `Bearer ${(0, creatorWithdrawalOperationalFixtures_1.adminToken)(fixture.fixture.actors.creatorId.toString())}` } });
            strict_1.default.equal(creatorResponse.status, 403);
            const before = await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
            const destination = await payoutDestination_model_1.PayoutDestination.findById(fixture.destination._id).lean().orFail();
            const response = await fetch(path, { headers: { authorization: `Bearer ${(0, creatorWithdrawalOperationalFixtures_1.adminToken)(fixture.fixture.actors.adminId.toString())}` } });
            strict_1.default.equal(response.status, 200);
            const body = await response.json();
            for (const forbidden of ["_id", "snapshotFingerprint",
                "reconciliationKey", "walletId", "creatorUserId"]) {
                strict_1.default.equal(forbidden in body.data, false);
            }
            strict_1.default.deepEqual(await (0, creatorWithdrawalOperationalFixtures_1.snapshotWithdrawalOperationalMoney)(fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id), before);
            strict_1.default.deepEqual(await payoutDestination_model_1.PayoutDestination.findById(fixture.destination._id).lean().orFail(), destination);
            for (const model of [creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation,
                creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt, creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation]) {
                const indexes = await model.collection.indexes();
                strict_1.default.ok(indexes.some((index) => index.unique === true));
                strict_1.default.ok(indexes.some((index) => "createdAt" in index.key));
            }
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalOperationalRegressionTests = registerWithdrawalOperationalRegressionTests;
