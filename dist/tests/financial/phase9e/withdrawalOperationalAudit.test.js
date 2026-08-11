"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalOperationalAuditTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../../enums/financial/creatorWithdrawalOperationalAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalOperationalAuditTests = () => {
    (0, node_test_1.test)("phase9e acknowledgement and resolution are guarded and audited", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            const acknowledged = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                reconciliationReference: reconciliation.reconciliationReference,
                action: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE, resolutionCode: "REVIEWED", adminUserId: adminId,
            });
            strict_1.default.equal(acknowledged.status, "ACKNOWLEDGED");
            const resolved = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                reconciliationReference: reconciliation.reconciliationReference,
                action: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE, resolutionCode: "GRAPH_HEALTHY",
                resolutionNote: "Authoritative replay passed.", adminUserId: adminId,
            });
            strict_1.default.equal(resolved.status, "RESOLVED");
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: { $in: [
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED,
                    ] } }), 2);
            await strict_1.default.rejects(creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                reconciliationReference: reconciliation.reconciliationReference,
                action: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE, resolutionCode: "AGAIN", adminUserId: adminId,
            }), (error) => error.code === "CREATOR_WITHDRAWAL_OPERATIONAL_ALREADY_RESOLVED");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalOperationalAuditTests = registerWithdrawalOperationalAuditTests;
