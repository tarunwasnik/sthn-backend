"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderInitializationFixtures_1 = require("./fixtures/withdrawalProviderInitializationFixtures");
const registerWithdrawalProviderReplayTests = () => {
    (0, node_test_1.test)("phase9b replay regenerates identity and never duplicates authority, events, or audit", async () => {
        const server = await (0, withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(server.baseUrl);
            const reference = fixture.withdrawal.withdrawalReference;
            const first = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(reference);
            const second = await new withdrawalProviderInitialization_service_1.WithdrawalProviderInitializationService().initialize(reference);
            const validated = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.validateReplay(reference);
            strict_1.default.equal(first.providerRequestReference, second.providerRequestReference);
            strict_1.default.equal(first.providerReference, validated.providerReference);
            strict_1.default.equal(second.replay, true);
            strict_1.default.equal(validated.replay, true);
            strict_1.default.equal(await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments(), 1);
            strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                entityType: "WITHDRAWAL_PROVIDER_REQUEST",
            }), 2);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderReplayTests = registerWithdrawalProviderReplayTests;
