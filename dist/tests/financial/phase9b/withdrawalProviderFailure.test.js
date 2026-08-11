"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalProviderInitializationFixtures_1 = require("./fixtures/withdrawalProviderInitializationFixtures");
const registerWithdrawalProviderFailureTests = () => {
    (0, node_test_1.test)("phase9b every injected initialization interruption rolls back all Phase 9B effects", async () => {
        const stages = [
            "AFTER_PROVIDER_AUTHORITY",
            "AFTER_PROVIDER_EVENT",
            "BEFORE_INITIALIZATION",
            "BEFORE_AUDIT",
            "BEFORE_COMMIT",
        ];
        for (const stage of stages) {
            const server = await (0, withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(server.baseUrl);
                const before = await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id);
                const service = new withdrawalProviderInitialization_service_1.WithdrawalProviderInitializationService((current) => {
                    if (current === stage)
                        throw new Error(`PHASE9B_${stage}`);
                });
                await strict_1.default.rejects(service.initialize(fixture.withdrawal.withdrawalReference));
                strict_1.default.equal(await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments(), 0);
                strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                    entityType: "WITHDRAWAL_PROVIDER_REQUEST",
                }), 0);
                strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                }), 0);
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).orFail();
                strict_1.default.equal(withdrawal.status, "RESERVED");
                strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
                strict_1.default.equal(withdrawal.providerRequestReference, undefined);
                strict_1.default.deepEqual(await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id), before);
            }
            finally {
                await server.close();
                await (0, database_1.clearPhase7HDatabase)();
            }
        }
    });
};
exports.registerWithdrawalProviderFailureTests = registerWithdrawalProviderFailureTests;
