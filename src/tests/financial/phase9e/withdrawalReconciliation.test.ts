import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalReconciliation } from
  "../../../models/creatorWithdrawalReconciliation.model";
import { creatorWithdrawalReconciliationService } from
  "../../../services/financial/creatorWithdrawalReconciliation.service";
import {
  createPendingFinalizationFixture,
  snapshotWithdrawalOperationalMoney,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalReconciliationTests = () => {
  test("phase9e persists deterministic pending-success reconciliation", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createPendingFinalizationFixture(server.baseUrl,
        Outcome.SUCCESS);
      const before = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      const result = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference,
        fixture.fixture.actors.adminId.toString(),
      );
      assert.equal(result.classification, "FINALIZATION_PENDING_SUCCESS");
      assert.equal(result.status, "OPEN");
      assert.equal(result.allowedActions.includes("RETRY_FINALIZATION"), true);
      assert.equal(await CreatorWithdrawalReconciliation.countDocuments(), 1);
      assert.deepEqual(await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id), before);
    } finally { await server.close(); }
  });
};
