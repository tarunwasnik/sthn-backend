"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalPayout_model_1 = __importDefault(require("../../../models/internalProvider/internalPayout.model"));
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const payoutDestination_model_1 = require("../../../models/payoutDestination.model");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalRegressionTests = () => {
    (0, node_test_1.test)("phase9d does not execute providers or touch legacy financial domains", async () => {
        const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const destinationBefore = await payoutDestination_model_1.PayoutDestination.findById(fixture.destination._id).lean().orFail();
            const legacyBefore = await Promise.all([
                internalPayout_model_1.default.countDocuments(), payout_model_1.Payout.countDocuments(),
                withdrawal_model_1.Withdrawal.countDocuments(), refund_model_1.Refund.countDocuments(),
            ]);
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
            await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.validateReplay(fixture.withdrawal.withdrawalReference, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            strict_1.default.deepEqual(await Promise.all([
                internalPayout_model_1.default.countDocuments(), payout_model_1.Payout.countDocuments(),
                withdrawal_model_1.Withdrawal.countDocuments(), refund_model_1.Refund.countDocuments(),
            ]), legacyBefore);
            strict_1.default.deepEqual(await payoutDestination_model_1.PayoutDestination.findById(fixture.destination._id).lean().orFail(), destinationBefore);
            const indexes = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.indexes();
            const keys = indexes.map((index) => JSON.stringify(index.key));
            for (const expected of [
                { finalizationReference: 1 }, { finalizationKey: 1 },
                { finalizationTransactionId: 1 },
                { finalizationProjectionOperationReference: 1 },
                { status: 1, completedAt: -1 }, { status: 1, failedAt: -1 },
                { walletId: 1, status: 1 }, { creatorId: 1, status: 1 },
                { providerRequestReference: 1 },
            ])
                strict_1.default.ok(keys.includes(JSON.stringify(expected)));
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalRegressionTests = registerWithdrawalRegressionTests;
