"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalOperationalConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const creatorWithdrawalOperationalAction_enum_1 = require("../../../enums/financial/creatorWithdrawalOperationalAction.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalFinalizationRetry_service_1 = require("../../../services/financial/creatorWithdrawalFinalizationRetry.service");
const creatorWithdrawalReconciliation_service_1 = require("../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalRepair_service_1 = require("../../../services/financial/creatorWithdrawalRepair.service");
const creatorWithdrawalOperationalFixtures_1 = require("./fixtures/creatorWithdrawalOperationalFixtures");
const registerWithdrawalOperationalConcurrencyTests = () => {
    (0, node_test_1.test)("phase9e ten concurrent inspections converge on one authority", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const adminId = fixture.fixture.actors.adminId.toString();
            const attempts = await Promise.all(Array.from({ length: 10 }, () => creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId)));
            strict_1.default.equal(new Set(attempts.map((item) => item.reconciliationReference)).size, 1);
            strict_1.default.equal(await creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.countDocuments(), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: "CREATOR_WITHDRAWAL_RECONCILIATION_CREATED",
            }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e concurrent retries cannot duplicate Phase 9D accounting", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => creatorWithdrawalFinalizationRetry_service_1.creatorWithdrawalFinalizationRetryService.retry(reconciliation.reconciliationReference, adminId)));
            strict_1.default.ok(attempts.some((attempt) => attempt.status === "fulfilled"));
            strict_1.default.equal(await creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.countDocuments(), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: "WITHDRAWAL_PROVIDER_FINALIZATION",
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                operationKey: /^creator-withdrawal-finalization:/,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e identical repairs converge and status races are guarded", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }, { $set: { finalizationLedgerEntryIds: [] } });
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            await Promise.allSettled(Array.from({ length: 10 }, () => creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId)));
            strict_1.default.equal(await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(), 1);
            const statusRace = await Promise.allSettled([
                creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                    reconciliationReference: reconciliation.reconciliationReference,
                    action: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE, resolutionCode: "RACE", adminUserId: adminId,
                }),
                creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.updateStatus({
                    reconciliationReference: reconciliation.reconciliationReference,
                    action: creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE, resolutionCode: "RACE", adminUserId: adminId,
                }),
            ]);
            strict_1.default.ok(statusRace.some((attempt) => attempt.status === "fulfilled"));
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e conflicting concurrent repairs fail closed", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createHealthyWithdrawalFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.collection.updateOne({
                withdrawalReference: fixture.withdrawal.withdrawalReference,
            }, { $set: { finalizationLedgerEntryIds: [] } });
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            const repairs = await Promise.allSettled([
                creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId),
                creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT, adminId),
            ]);
            strict_1.default.equal(repairs.filter((item) => item.status === "fulfilled").length, 1);
            strict_1.default.equal(repairs.filter((item) => item.status === "rejected").length, 1);
            strict_1.default.equal(await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9e retry racing with repair leaves one healthy authority", async () => {
        const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalOperationalFixtures_1.createPendingFinalizationFixture)(server.baseUrl, withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS);
            const adminId = fixture.fixture.actors.adminId.toString();
            const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            const race = await Promise.allSettled([
                creatorWithdrawalFinalizationRetry_service_1.creatorWithdrawalFinalizationRetryService.retry(reconciliation.reconciliationReference, adminId),
                creatorWithdrawalRepair_service_1.creatorWithdrawalRepairService.repair(reconciliation.reconciliationReference, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS, adminId),
            ]);
            strict_1.default.equal(race.filter((item) => item.status === "fulfilled").length, 1);
            strict_1.default.equal(race.filter((item) => item.status === "rejected").length, 1);
            strict_1.default.equal(await creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.countDocuments(), 1);
            strict_1.default.equal(await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: "WITHDRAWAL_PROVIDER_FINALIZATION",
            }), 2);
            const after = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(fixture.withdrawal.withdrawalReference, adminId);
            strict_1.default.equal(after.classification, "HEALTHY_COMPLETED");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalOperationalConcurrencyTests = registerWithdrawalOperationalConcurrencyTests;
