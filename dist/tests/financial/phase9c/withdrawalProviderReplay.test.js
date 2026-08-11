"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderExecutionReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const withdrawalProviderExecutionFixtures_1 = require("./fixtures/withdrawalProviderExecutionFixtures");
const registerWithdrawalProviderExecutionReplayTests = () => {
    (0, node_test_1.test)("phase9c terminal replay never duplicates provider execution, events, or audits", async () => {
        const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
            const input = {
                withdrawalReference: fixture.withdrawal.withdrawalReference,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
            };
            const first = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute(input);
            const second = await new withdrawalProviderExecution_service_1.WithdrawalProviderExecutionService()
                .execute(input);
            const validated = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService
                .validateReplay(input.withdrawalReference, input.outcome);
            strict_1.default.equal(first.executionReference, second.executionReference);
            strict_1.default.equal(second.replay, true);
            strict_1.default.equal(validated.replay, true);
            strict_1.default.equal(await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments(), 1);
            strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                entityType: "WITHDRAWAL_PROVIDER_REQUEST",
            }), 4);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: {
                    $in: [
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
                    ],
                },
            }), 3);
            await strict_1.default.rejects(withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
                ...input,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.FAILURE,
            }), (error) => error.code === "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderExecutionReplayTests = registerWithdrawalProviderExecutionReplayTests;
