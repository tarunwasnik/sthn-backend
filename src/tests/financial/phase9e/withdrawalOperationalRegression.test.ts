import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalReconciliation } from
  "../../../models/creatorWithdrawalReconciliation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../models/creatorWithdrawalRetryAttempt.model";
import { PayoutDestination } from
  "../../../models/payoutDestination.model";
import {
  adminToken,
  createHealthyWithdrawalFixture,
  snapshotWithdrawalOperationalMoney,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalOperationalRegressionTests = () => {
  test("phase9e admin endpoint is protected, safe, and verifies operational indexes", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.SUCCESS);
      const path = `${server.baseUrl}/api/v1/admin/financial/creator-withdrawals/` +
        `${fixture.withdrawal.withdrawalReference}/reconciliation`;
      assert.equal((await fetch(path)).status, 401);
      const userResponse = await fetch(path, { headers: { authorization:
        `Bearer ${adminToken(fixture.fixture.actors.userId.toString())}` } });
      assert.equal(userResponse.status, 403);
      const creatorResponse = await fetch(path, { headers: { authorization:
        `Bearer ${adminToken(fixture.fixture.actors.creatorId.toString())}` } });
      assert.equal(creatorResponse.status, 403);
      const before = await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id);
      const destination = await PayoutDestination.findById(
        fixture.destination._id).lean().orFail();
      const response = await fetch(path, { headers: { authorization:
        `Bearer ${adminToken(fixture.fixture.actors.adminId.toString())}` } });
      assert.equal(response.status, 200);
      const body = await response.json() as { data: Record<string, unknown> };
      for (const forbidden of ["_id", "snapshotFingerprint",
        "reconciliationKey", "walletId", "creatorUserId"]) {
        assert.equal(forbidden in body.data, false);
      }
      assert.deepEqual(await snapshotWithdrawalOperationalMoney(
        fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id), before);
      assert.deepEqual(await PayoutDestination.findById(
        fixture.destination._id).lean().orFail(), destination);
      for (const model of [CreatorWithdrawalReconciliation,
        CreatorWithdrawalRetryAttempt, CreatorWithdrawalRepairOperation]) {
        const indexes = await model.collection.indexes();
        assert.ok(indexes.some((index) => index.unique === true));
        assert.ok(indexes.some((index) => "createdAt" in index.key));
      }
    } finally { await server.close(); }
  });
};
