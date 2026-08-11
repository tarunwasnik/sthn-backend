"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderExecutionConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const providerSimulator_service_1 = require("../../../services/providerSimulator/providerSimulator.service");
const withdrawalProviderExecutionFixtures_1 = require("./fixtures/withdrawalProviderExecutionFixtures");
const registerWithdrawalProviderExecutionConcurrencyTests = () => {
    (0, node_test_1.test)("phase9c ten concurrent execution attempts converge on one provider result", async () => {
        const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
            let executions = 0;
            const service = new withdrawalProviderExecution_service_1.WithdrawalProviderExecutionService(() => undefined, (input) => {
                executions += 1;
                return providerSimulator_service_1.providerSimulatorService.simulateWithdrawalProvider(input);
            });
            const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => service.execute({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
                outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
            })));
            strict_1.default.ok(attempts.every((attempt) => attempt.status === "fulfilled"), attempts.map((attempt) => attempt.status === "fulfilled"
                ? "fulfilled" : String(attempt.reason)).join(" | "));
            strict_1.default.equal(executions, 1);
            strict_1.default.equal(await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({
                providerStatus: "SUCCEEDED",
            }), 1);
            strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                entityType: "WITHDRAWAL_PROVIDER_REQUEST",
            }), 4);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: {
                    $in: [
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
                    ],
                },
            }), 2);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderExecutionConcurrencyTests = registerWithdrawalProviderExecutionConcurrencyTests;
