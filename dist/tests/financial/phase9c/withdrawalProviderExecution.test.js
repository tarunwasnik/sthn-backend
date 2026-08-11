"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderExecutionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const withdrawalProviderExecutionFixtures_1 = require("./fixtures/withdrawalProviderExecutionFixtures");
const registerWithdrawalProviderExecutionTests = () => {
    (0, node_test_1.test)("phase9c executes INITIALIZED to PROCESSING to SUCCEEDED without accounting", async () => {
        const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
            const before = await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id);
            const result = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
            });
            strict_1.default.equal(result.providerStatus, "SUCCEEDED");
            strict_1.default.equal(result.responseCode, "INTERNAL_PROVIDER_SUCCEEDED");
            strict_1.default.equal(result.replay, false);
            const provider = await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).select("+providerRequestKey +providerFingerprint +executionFingerprint")
                .orFail();
            strict_1.default.equal(provider.version, 3);
            strict_1.default.equal(provider.isTerminal, true);
            strict_1.default.ok(provider.processingAt);
            strict_1.default.ok(provider.succeededAt);
            strict_1.default.equal(provider.failedAt, undefined);
            strict_1.default.match(provider.executionReference ?? "", /^IWXE-/);
            strict_1.default.match(provider.executionFingerprint ?? "", /^[a-f0-9]{64}$/);
            strict_1.default.equal(provider.providerMetadata?.provider, "INTERNAL");
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).orFail();
            strict_1.default.equal(withdrawal.status, "RESERVED");
            strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
            strict_1.default.equal(withdrawal.providerTerminalStatus, "SUCCEEDED");
            strict_1.default.equal(withdrawal.providerExecutionMetadata?.executionReference, provider.executionReference);
            strict_1.default.deepEqual(await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id), before);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9c persists FAILED provider execution without releasing reservation", async () => {
        const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
            const before = await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id);
            const result = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE,
                failureCode: "BANK_NETWORK_FAILURE",
                failureReason: "Simulated provider network rejection.",
            });
            strict_1.default.equal(result.providerStatus, "FAILED");
            strict_1.default.equal(result.responseCode, "BANK_NETWORK_FAILURE");
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).orFail();
            strict_1.default.equal(withdrawal.status, "RESERVED");
            strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
            strict_1.default.equal(withdrawal.providerTerminalStatus, "FAILED");
            strict_1.default.equal(withdrawal.providerExecutionMetadata?.failureCode, "BANK_NETWORK_FAILURE");
            strict_1.default.deepEqual(await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id), before);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderExecutionTests = registerWithdrawalProviderExecutionTests;
