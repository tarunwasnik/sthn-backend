"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalReplayTests = () => {
    for (const outcome of [
        withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
        withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE,
    ]) {
        (0, node_test_1.test)(`phase9d ${outcome.toLowerCase()} replay is authoritative and read-only`, async () => {
            const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, outcome);
                const first = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
                const before = await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id);
                const second = await new creatorWithdrawalFinalization_service_1.CreatorWithdrawalFinalizationService()
                    .finalize(fixture.withdrawal.withdrawalReference);
                const validated = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService
                    .validateReplay(fixture.withdrawal.withdrawalReference);
                strict_1.default.equal(second.finalizationReference, first.finalizationReference);
                strict_1.default.equal(second.replay, true);
                strict_1.default.equal(validated.replay, true);
                strict_1.default.deepEqual(await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id), before);
            }
            finally {
                await server.close();
            }
        });
    }
};
exports.registerWithdrawalReplayTests = registerWithdrawalReplayTests;
