"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderInitializationFixtures_1 = require("./fixtures/withdrawalProviderInitializationFixtures");
const registerWithdrawalProviderConcurrencyTests = () => {
    (0, node_test_1.test)("phase9b ten simultaneous initializations converge on one provider identity", async () => {
        const server = await (0, withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(server.baseUrl);
            const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(fixture.withdrawal.withdrawalReference)));
            strict_1.default.ok(attempts.every((attempt) => attempt.status === "fulfilled"), attempts.map((attempt) => attempt.status === "fulfilled"
                ? "fulfilled" : String(attempt.reason)).join(" | "));
            const identities = attempts.map((attempt) => attempt.status === "fulfilled"
                ? `${attempt.value.providerRequestReference}:` +
                    attempt.value.providerReference
                : "rejected");
            strict_1.default.equal(new Set(identities).size, 1);
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
exports.registerWithdrawalProviderConcurrencyTests = registerWithdrawalProviderConcurrencyTests;
