"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderExecutionFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderExecution_service_1 = require("../../../services/financial/withdrawalProviderExecution.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalProviderExecutionFixtures_1 = require("./fixtures/withdrawalProviderExecutionFixtures");
const registerWithdrawalProviderExecutionFailureTests = () => {
    (0, node_test_1.test)("phase9c every injected execution interruption rolls back all Phase 9C changes", async () => {
        const stages = [
            "BEFORE_PROCESSING",
            "AFTER_PROCESSING",
            "BEFORE_TERMINAL_STATE",
            "AFTER_TERMINAL_STATE",
            "BEFORE_AUDIT",
            "BEFORE_COMMIT",
        ];
        for (const stage of stages) {
            const server = await (0, withdrawalProviderExecutionFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture)(server.baseUrl);
                const before = await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id);
                const service = new withdrawalProviderExecution_service_1.WithdrawalProviderExecutionService((current) => {
                    if (current === stage)
                        throw new Error(`PHASE9C_${stage}`);
                });
                await strict_1.default.rejects(service.execute({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                    outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
                }));
                const provider = await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).orFail();
                strict_1.default.equal(provider.providerStatus, "INITIALIZED");
                strict_1.default.equal(provider.version, 1);
                strict_1.default.equal(provider.executionReference, undefined);
                strict_1.default.equal(provider.processingAt, undefined);
                strict_1.default.equal(provider.isTerminal, false);
                strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                    entityType: "WITHDRAWAL_PROVIDER_REQUEST",
                }), 2);
                strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                    action: {
                        $in: [
                            auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
                            auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
                            auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
                        ],
                    },
                }), 0);
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).orFail();
                strict_1.default.equal(withdrawal.status, "RESERVED");
                strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
                strict_1.default.equal(withdrawal.providerTerminalStatus, undefined);
                strict_1.default.deepEqual(await (0, withdrawalProviderExecutionFixtures_1.snapshotPhase9CFinancialState)(fixture.creatorWallet._id), before);
            }
            finally {
                await server.close();
                await (0, database_1.clearPhase7HDatabase)();
            }
        }
    });
};
exports.registerWithdrawalProviderExecutionFailureTests = registerWithdrawalProviderExecutionFailureTests;
