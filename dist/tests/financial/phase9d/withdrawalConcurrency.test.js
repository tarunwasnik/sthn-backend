"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalConcurrencyTests = () => {
    (0, node_test_1.test)("phase9d ten-way success and failure concurrency converge", async () => {
        for (const outcome of [
            withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
            withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE,
        ]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, outcome);
                const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference)));
                strict_1.default.ok(attempts.every((attempt) => attempt.status === "fulfilled"), attempts.map((attempt) => attempt.status === "fulfilled" ? "fulfilled" :
                    String(attempt.reason)).join(" | "));
                const state = await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id);
                strict_1.default.equal(state.ledgerCount, 2);
                strict_1.default.equal(state.projectionCount, 1);
                strict_1.default.equal(state.auditCount, 1);
                const replays = await Promise.all(Array.from({ length: 10 }, () => creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(fixture.withdrawal.withdrawalReference)));
                strict_1.default.ok(replays.every((result) => result.replay));
                strict_1.default.deepEqual(await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id), state);
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerWithdrawalConcurrencyTests = registerWithdrawalConcurrencyTests;
