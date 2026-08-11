import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { CreatorWithdrawalOperationalAction as Action } from
  "../../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { creatorWithdrawalReconciliationService } from
  "../../../services/financial/creatorWithdrawalReconciliation.service";
import { creatorWithdrawalRepairService } from
  "../../../services/financial/creatorWithdrawalRepair.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createHealthyWithdrawalFixture,
  snapshotWithdrawalOperationalMoney,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalRepairTests = () => {
  test("phase9e restores only proven missing finalization links idempotently", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.SUCCESS);
      await CreatorWithdrawalRequest.collection.updateOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }, { $set: { finalizationLedgerEntryIds: [] } });
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId,
      );
      assert.equal(reconciliation.classification, "MISSING_FINALIZATION_LINKS");
      const before = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      const first = await creatorWithdrawalRepairService.repair(
        reconciliation.reconciliationReference,
        Action.RESTORE_FINALIZATION_LINKS, adminId,
      );
      const second = await creatorWithdrawalRepairService.repair(
        reconciliation.reconciliationReference,
        Action.RESTORE_FINALIZATION_LINKS, adminId,
      );
      assert.equal(first.repairReference, second.repairReference);
      assert.equal(second.replay, true);
      const after = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      assert.deepEqual(after.wallet, before.wallet);
      assert.equal(after.ledgerCount, before.ledgerCount);
      assert.equal(after.projectionCount, before.projectionCount);
      assert.equal(after.terminalAuditCount, before.terminalAuditCount);
      assert.equal(after.withdrawal.status, before.withdrawal.status);
      assert.equal(after.withdrawal.amount, before.withdrawal.amount);
      assert.equal(after.withdrawal.currency, before.withdrawal.currency);
    } finally { await server.close(); }
  });

  test("phase9e restores one missing terminal audit without financial mutation", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.FAILURE);
      await AuditLog.deleteOne({ action: AuditAction.CREATOR_WITHDRAWAL_FAILED });
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId,
      );
      assert.equal(reconciliation.classification, "MISSING_AUDIT");
      const before = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      await creatorWithdrawalRepairService.repair(
        reconciliation.reconciliationReference,
        Action.RESTORE_TERMINAL_AUDIT, adminId,
      );
      const after = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      assert.equal(after.ledgerCount, before.ledgerCount);
      assert.equal(after.projectionCount, before.projectionCount);
      assert.deepEqual(after.wallet, before.wallet);
      assert.equal(after.terminalAuditCount, 1);
    } finally { await server.close(); }
  });
};
