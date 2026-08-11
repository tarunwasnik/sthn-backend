import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { creatorWithdrawalFinalizationRetryService } from
  "../../../services/financial/creatorWithdrawalFinalizationRetry.service";
import { creatorWithdrawalReconciliationService } from
  "../../../services/financial/creatorWithdrawalReconciliation.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createPendingFinalizationFixture,
  snapshotWithdrawalOperationalMoney,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalRetryTests = () => {
  test("phase9e retries pending success and failure only through Phase 9D", async () => {
    for (const [outcome, terminal, healthy] of [
      [Outcome.SUCCESS, "COMPLETED", "HEALTHY_COMPLETED"],
      [Outcome.FAILURE, "FAILED", "HEALTHY_FAILED"],
    ] as const) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createPendingFinalizationFixture(server.baseUrl, outcome);
        const adminId = fixture.fixture.actors.adminId.toString();
        const reconciliation = await creatorWithdrawalReconciliationService.inspect(
          fixture.withdrawal.withdrawalReference, adminId,
        );
        const before = await snapshotWithdrawalOperationalMoney(
          fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
        const retried = await creatorWithdrawalFinalizationRetryService.retry(
          reconciliation.reconciliationReference, adminId,
        );
        assert.equal(retried.classification, healthy);
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        assert.equal(withdrawal.status, terminal);
        const after = await snapshotWithdrawalOperationalMoney(
          fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
        assert.equal(after.ledgerCount, before.ledgerCount + 2);
        assert.equal(after.projectionCount, before.projectionCount + 1);
        assert.equal(after.terminalAuditCount, before.terminalAuditCount + 1);
        if (outcome === Outcome.SUCCESS) {
          assert.equal(after.wallet.currentBalance,
            before.wallet.currentBalance - fixture.withdrawal.amount);
        } else {
          assert.equal(after.wallet.currentBalance, before.wallet.currentBalance);
          assert.equal(after.wallet.availableBalance,
            before.wallet.availableBalance + fixture.withdrawal.amount);
        }
      } finally { await server.close(); }
    }
  });
};
