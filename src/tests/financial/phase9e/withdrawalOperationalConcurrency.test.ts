import assert from "node:assert/strict";
import { test } from "node:test";

import { CreatorWithdrawalOperationalAction as Action } from
  "../../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalReconciliation } from
  "../../../models/creatorWithdrawalReconciliation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../models/creatorWithdrawalRetryAttempt.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalFinalizationRetryService } from
  "../../../services/financial/creatorWithdrawalFinalizationRetry.service";
import { creatorWithdrawalReconciliationService } from
  "../../../services/financial/creatorWithdrawalReconciliation.service";
import { creatorWithdrawalRepairService } from
  "../../../services/financial/creatorWithdrawalRepair.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createHealthyWithdrawalFixture,
  createPendingFinalizationFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalOperationalConcurrencyTests = () => {
  test("phase9e ten concurrent inspections converge on one authority", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createPendingFinalizationFixture(server.baseUrl,
        Outcome.SUCCESS);
      const adminId = fixture.fixture.actors.adminId.toString();
      const attempts = await Promise.all(Array.from({ length: 10 }, () =>
        creatorWithdrawalReconciliationService.inspect(
          fixture.withdrawal.withdrawalReference, adminId)));
      assert.equal(new Set(attempts.map((item) =>
        item.reconciliationReference)).size, 1);
      assert.equal(await CreatorWithdrawalReconciliation.countDocuments(), 1);
      assert.equal(await AuditLog.countDocuments({
        action: "CREATOR_WITHDRAWAL_RECONCILIATION_CREATED",
      }), 1);
    } finally { await server.close(); }
  });

  test("phase9e concurrent retries cannot duplicate Phase 9D accounting", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createPendingFinalizationFixture(server.baseUrl,
        Outcome.SUCCESS);
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId);
      const attempts = await Promise.allSettled(Array.from({ length: 10 }, () =>
        creatorWithdrawalFinalizationRetryService.retry(
          reconciliation.reconciliationReference, adminId)));
      assert.ok(attempts.some((attempt) => attempt.status === "fulfilled"));
      assert.equal(await CreatorWithdrawalRetryAttempt.countDocuments(), 1);
      assert.equal(await LedgerEntry.countDocuments({
        source: "WITHDRAWAL_PROVIDER_FINALIZATION",
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        operationKey: /^creator-withdrawal-finalization:/,
      }), 1);
    } finally { await server.close(); }
  });

  test("phase9e identical repairs converge and status races are guarded", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.SUCCESS);
      await CreatorWithdrawalRequest.collection.updateOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }, { $set: { finalizationLedgerEntryIds: [] } });
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId);
      await Promise.allSettled(Array.from({ length: 10 }, () =>
        creatorWithdrawalRepairService.repair(
          reconciliation.reconciliationReference,
          Action.RESTORE_FINALIZATION_LINKS, adminId)));
      assert.equal(await CreatorWithdrawalRepairOperation.countDocuments(), 1);
      const statusRace = await Promise.allSettled([
        creatorWithdrawalReconciliationService.updateStatus({
          reconciliationReference: reconciliation.reconciliationReference,
          action: Action.ACKNOWLEDGE, resolutionCode: "RACE", adminUserId: adminId,
        }),
        creatorWithdrawalReconciliationService.updateStatus({
          reconciliationReference: reconciliation.reconciliationReference,
          action: Action.RESOLVE, resolutionCode: "RACE", adminUserId: adminId,
        }),
      ]);
      assert.ok(statusRace.some((attempt) => attempt.status === "fulfilled"));
    } finally { await server.close(); }
  });

  test("phase9e conflicting concurrent repairs fail closed", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.SUCCESS);
      await CreatorWithdrawalRequest.collection.updateOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }, { $set: { finalizationLedgerEntryIds: [] } });
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId);
      const repairs = await Promise.allSettled([
        creatorWithdrawalRepairService.repair(
          reconciliation.reconciliationReference,
          Action.RESTORE_FINALIZATION_LINKS, adminId),
        creatorWithdrawalRepairService.repair(
          reconciliation.reconciliationReference,
          Action.RESTORE_TERMINAL_AUDIT, adminId),
      ]);
      assert.equal(repairs.filter((item) => item.status === "fulfilled").length, 1);
      assert.equal(repairs.filter((item) => item.status === "rejected").length, 1);
      assert.equal(await CreatorWithdrawalRepairOperation.countDocuments(), 1);
    } finally { await server.close(); }
  });

  test("phase9e retry racing with repair leaves one healthy authority", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createPendingFinalizationFixture(server.baseUrl,
        Outcome.SUCCESS);
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId);
      const race = await Promise.allSettled([
        creatorWithdrawalFinalizationRetryService.retry(
          reconciliation.reconciliationReference, adminId),
        creatorWithdrawalRepairService.repair(
          reconciliation.reconciliationReference,
          Action.RESTORE_FINALIZATION_LINKS, adminId),
      ]);
      assert.equal(race.filter((item) => item.status === "fulfilled").length, 1);
      assert.equal(race.filter((item) => item.status === "rejected").length, 1);
      assert.equal(await CreatorWithdrawalRetryAttempt.countDocuments(), 1);
      assert.equal(await CreatorWithdrawalRepairOperation.countDocuments(), 0);
      assert.equal(await LedgerEntry.countDocuments({
        source: "WITHDRAWAL_PROVIDER_FINALIZATION",
      }), 2);
      const after = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId);
      assert.equal(after.classification, "HEALTHY_COMPLETED");
    } finally { await server.close(); }
  });
};
