"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalOperationalFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const creatorWithdrawalOperationalAction_enum_1 = require("../../../enums/financial/creatorWithdrawalOperationalAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const creatorWithdrawalFinalizationRetry_service_1 = require("../../../services/financial/creatorWithdrawalFinalizationRetry.service");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalRepair_service_1 = require("../../../services/financial/creatorWithdrawalRepair.service");
const creatorWithdrawalOperationalInspection_service_1 = require("../../../services/financial/creatorWithdrawalOperationalInspection.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalOperationalFailureTests = () => {
    (0, node_test_1.test)("phase9e reconciliation authority and audit interruptions roll back", async () => {
        for (const stage of ["AFTER_RECONCILIATION_AUTHORITY",
            "BEFORE_RECONCILIATION_AUDIT", "BEFORE_OPERATIONAL_COMMIT"]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                const service = new creatorWithdrawalReconciliation_service_1.CreatorWithdrawalReconciliationService((current) => {
                    if (current === stage)
                        throw new Error(stage);
                });
                await strict_1.default.rejects(service.inspect(fixture.withdrawal.withdrawalReference, fixture.fixture.actors.adminId.toString()));
                strict_1.default.equal(await creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.countDocuments(), 0);
            }
            finally {
                await server.close();
            }
        }
    });
    (0, node_test_1.test)("phase9e post-Phase-9D operational failure never rolls back accounting", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await new creatorWithdrawalReconciliation_service_1.CreatorWithdrawalReconciliationService()
                .inspect(fixture.withdrawal.withdrawalReference, adminId);
            const retry = new creatorWithdrawalFinalizationRetry_service_1.CreatorWithdrawalFinalizationRetryService((stage) => {
                if (stage === "BEFORE_POST_FINALIZATION_UPDATE")
                    throw new Error(stage);
            });
            await strict_1.default.rejects(retry.retry(reconciliation.reconciliationReference, adminId));
            const inspection = await creatorWithdrawalOperationalInspection_service_1.creatorWithdrawalOperationalInspectionService.inspect(fixture.withdrawal.withdrawalReference);
            strict_1.default.equal(inspection.classification, "HEALTHY_COMPLETED");
            strict_1.default.equal(await creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.countDocuments(), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e repair interruptions roll back metadata and operation", async () => {
        for (const stage of ["AFTER_REPAIR_OPERATION_CREATION",
            "BEFORE_GUARDED_METADATA_REPAIR", "BEFORE_REPAIR_AUDIT",
            "BEFORE_OPERATIONAL_COMMIT"]) {
            await (0, database_1.clearPhase7HDatabase)();
            const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
                await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }, { $set: { finalizationLedgerEntryIds: [] } });
                const adminId = fixture.fixture.actors.adminId.toString();
                const reconciliation = await new creatorWithdrawalReconciliation_service_1.CreatorWithdrawalReconciliationService()
                    .inspect(fixture.withdrawal.withdrawalReference, adminId);
                const repair = new creatorWithdrawalRepair_service_1.CreatorWithdrawalRepairService((current) => {
                    if (current === stage)
                        throw new Error(stage);
                });
                await strict_1.default.rejects(repair.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId));
                strict_1.default.equal(await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(), 0);
                const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
                    withdrawalReference: fixture.withdrawal.withdrawalReference,
                }).select("+finalizationLedgerEntryIds").orFail();
                strict_1.default.equal(withdrawal.finalizationLedgerEntryIds.length, 0);
            }
            finally {
                await server.close();
            }
        }
    });
};
exports.registerWithdrawalOperationalFailureTests = registerWithdrawalOperationalFailureTests;
