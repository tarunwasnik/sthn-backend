"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderInitializationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProvider_1 = require("../../../constants/internalProvider");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderInitializationFixtures_1 = require("./fixtures/withdrawalProviderInitializationFixtures");
const registerWithdrawalProviderInitializationTests = () => {
    (0, node_test_1.test)("phase9b initializes one immutable provider authority without moving money", async () => {
        const server = await (0, withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(server.baseUrl);
            const before = await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id);
            const result = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(fixture.withdrawal.withdrawalReference);
            strict_1.default.equal(result.providerStatus, "INITIALIZED");
            strict_1.default.equal(result.replay, false);
            strict_1.default.match(result.providerRequestReference, /^IWPR-/);
            strict_1.default.match(result.providerReference ?? "", /^INTERNAL-WD-/);
            const authority = await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).select("+providerRequestKey +providerFingerprint").orFail();
            strict_1.default.equal(authority.version, 1);
            strict_1.default.match(authority.providerFingerprint, /^[a-f0-9]{64}$/);
            const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }).orFail();
            strict_1.default.equal(withdrawal.status, "RESERVED");
            strict_1.default.equal(withdrawal.reservedAmount, withdrawal.amount);
            strict_1.default.equal(withdrawal.providerRequestReference, authority.providerRequestReference);
            strict_1.default.deepEqual(await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id), before);
            strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                entityId: authority._id,
                eventType: {
                    $in: [
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
                    ],
                },
            }), 2);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                entityId: authority._id,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderInitializationTests = registerWithdrawalProviderInitializationTests;
