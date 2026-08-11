import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { withdrawalProviderExecutionService } from
  "../../../services/financial/withdrawalProviderExecution.service";
import {
  createInitializedWithdrawalProviderFixture,
  snapshotPhase9CFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderExecutionFixtures";

export const registerWithdrawalProviderExecutionTests = () => {
  test("phase9c executes INITIALIZED to PROCESSING to SUCCEEDED without accounting", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createInitializedWithdrawalProviderFixture(server.baseUrl);
      const before = await snapshotPhase9CFinancialState(
        fixture.creatorWallet._id,
      );
      const result = await withdrawalProviderExecutionService.execute({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
        outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
      });
      assert.equal(result.providerStatus, "SUCCEEDED");
      assert.equal(result.responseCode, "INTERNAL_PROVIDER_SUCCEEDED");
      assert.equal(result.replay, false);
      const provider = await InternalWithdrawalProviderRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).select("+providerRequestKey +providerFingerprint +executionFingerprint")
        .orFail();
      assert.equal(provider.version, 3);
      assert.equal(provider.isTerminal, true);
      assert.ok(provider.processingAt);
      assert.ok(provider.succeededAt);
      assert.equal(provider.failedAt, undefined);
      assert.match(provider.executionReference ?? "", /^IWXE-/);
      assert.match(provider.executionFingerprint ?? "", /^[a-f0-9]{64}$/);
      assert.equal(provider.providerMetadata?.provider, "INTERNAL");
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).orFail();
      assert.equal(withdrawal.status, "RESERVED");
      assert.equal(withdrawal.reservedAmount, withdrawal.amount);
      assert.equal(withdrawal.providerTerminalStatus, "SUCCEEDED");
      assert.equal(
        withdrawal.providerExecutionMetadata?.executionReference,
        provider.executionReference,
      );
      assert.deepEqual(await snapshotPhase9CFinancialState(
        fixture.creatorWallet._id,
      ), before);
    } finally {
      await server.close();
    }
  });

  test("phase9c persists FAILED provider execution without releasing reservation", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createInitializedWithdrawalProviderFixture(server.baseUrl);
      const before = await snapshotPhase9CFinancialState(
        fixture.creatorWallet._id,
      );
      const result = await withdrawalProviderExecutionService.execute({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
        outcome: WithdrawalProviderExecutionOutcome.FAILURE,
        failureCode: "BANK_NETWORK_FAILURE",
        failureReason: "Simulated provider network rejection.",
      });
      assert.equal(result.providerStatus, "FAILED");
      assert.equal(result.responseCode, "BANK_NETWORK_FAILURE");
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).orFail();
      assert.equal(withdrawal.status, "RESERVED");
      assert.equal(withdrawal.reservedAmount, withdrawal.amount);
      assert.equal(withdrawal.providerTerminalStatus, "FAILED");
      assert.equal(
        withdrawal.providerExecutionMetadata?.failureCode,
        "BANK_NETWORK_FAILURE",
      );
      assert.deepEqual(await snapshotPhase9CFinancialState(
        fixture.creatorWallet._id,
      ), before);
    } finally {
      await server.close();
    }
  });
};
