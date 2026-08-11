"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalRollbackTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const creatorWithdrawalFinalization_service_1 = require("../../../services/financial/creatorWithdrawalFinalization.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalFinalizationFixtures_1 = require("./fixtures/creatorWithdrawalFinalizationFixtures");
const registerWithdrawalRollbackTests = () => {
    (0, node_test_1.test)("phase9d every injected interruption fully rolls back finalization", async () => {
        const stages = [
            "AFTER_FINALIZATION_IDENTITY",
            "AFTER_FIRST_LEDGER_ENTRY",
            "AFTER_BOTH_LEDGER_ENTRIES",
            "DURING_WALLET_PROJECTION",
            "AFTER_WALLET_PROJECTION",
            "BEFORE_WITHDRAWAL_TERMINAL_GUARD",
            "BEFORE_AUDIT",
            "BEFORE_COMMIT",
        ];
        for (const stage of stages) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalFinalizationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                const before = await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id);
                const service = new creatorWithdrawalFinalization_service_1.CreatorWithdrawalFinalizationService((current) => {
                    if (current === stage)
                        throw new Error(`PHASE9D_${stage}`);
                });
                await strict_1.default.rejects(service.finalize(fixture.withdrawal.withdrawalReference));
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).select("+finalizationKey +finalizationLedgerEntryIds").orFail();
                strict_1.default.equal(withdrawal.status, "RESERVED");
                strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
                strict_1.default.equal(withdrawal.finalizationReference, undefined);
                strict_1.default.equal(withdrawal.finalizationKey, undefined);
                strict_1.default.equal(withdrawal.finalizationLedgerEntryIds.length, 0);
                const provider = await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).orFail();
                strict_1.default.equal(provider.providerStatus, "SUCCEEDED");
                strict_1.default.equal(provider.version, 3);
                strict_1.default.deepEqual(await (0, creatorWithdrawalFinalizationFixtures_1.snapshotPhase9DFinancialState)(fixture.creatorWallet._id), before);
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerWithdrawalRollbackTests = registerWithdrawalRollbackTests;
