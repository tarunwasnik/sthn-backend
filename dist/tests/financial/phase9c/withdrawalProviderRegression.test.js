"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderExecutionRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalPayout_model_1 = __importDefault(require("../../../models/internalProvider/internalPayout.model"));
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderExecutionFixtures_1 = require("./fixtures/withdrawalProviderExecutionFixtures");
const registerWithdrawalProviderExecutionRegressionTests = () => {
    (0, node_test_1.test)("phase9c preserves Phase 9B and all unrelated financial authorities", async () => {
        const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
            const before = {
                financial: await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id),
                payouts: await payout_model_1.Payout.countDocuments(),
                withdrawals: await withdrawal_model_1.Withdrawal.countDocuments(),
                refunds: await refund_model_1.Refund.countDocuments(),
                internalPayments: await internalPayment_model_1.default.countDocuments(),
                internalPayouts: await internalPayout_model_1.default.countDocuments(),
                topUpFundings: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
            };
            await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
            });
            const phase9bReplay = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.validateReplay(fixture.withdrawal.withdrawalReference);
            strict_1.default.equal(phase9bReplay.providerStatus, "SUCCEEDED");
            strict_1.default.deepEqual(await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id), before.financial);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), before.payouts);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), before.withdrawals);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments(), before.refunds);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments(), before.internalPayments);
            strict_1.default.equal(await internalPayout_model_1.default.countDocuments(), before.internalPayouts);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), before.topUpFundings);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderExecutionRegressionTests = registerWithdrawalProviderExecutionRegressionTests;
