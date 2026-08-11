import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import InternalPaymentModel from
  "../../../models/internalProvider/internalPayment.model";
import InternalPayoutModel from
  "../../../models/internalProvider/internalPayout.model";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { withdrawalProviderExecutionService } from
  "../../../services/financial/withdrawalProviderExecution.service";
import { withdrawalProviderInitializationService } from
  "../../../services/financial/withdrawalProviderInitialization.service";
import {
  createInitializedWithdrawalProviderFixture,
  snapshotPhase9CFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderExecutionFixtures";

export const registerWithdrawalProviderExecutionRegressionTests = () => {
  test("phase9c preserves Phase 9B and all unrelated financial authorities", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createInitializedWithdrawalProviderFixture(server.baseUrl);
      const before = {
        financial: await snapshotPhase9CFinancialState(
          fixture.creatorWallet._id,
        ),
        payouts: await Payout.countDocuments(),
        withdrawals: await Withdrawal.countDocuments(),
        refunds: await Refund.countDocuments(),
        internalPayments: await InternalPaymentModel.countDocuments(),
        internalPayouts: await InternalPayoutModel.countDocuments(),
        topUpFundings: await InternalTopUpFunding.countDocuments(),
      };
      await withdrawalProviderExecutionService.execute({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
        outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
      });
      const phase9bReplay =
        await withdrawalProviderInitializationService.validateReplay(
          fixture.withdrawal.withdrawalReference,
        );
      assert.equal(phase9bReplay.providerStatus, "SUCCEEDED");
      assert.deepEqual(await snapshotPhase9CFinancialState(
        fixture.creatorWallet._id,
      ), before.financial);
      assert.equal(await Payout.countDocuments(), before.payouts);
      assert.equal(await Withdrawal.countDocuments(), before.withdrawals);
      assert.equal(await Refund.countDocuments(), before.refunds);
      assert.equal(
        await InternalPaymentModel.countDocuments(),
        before.internalPayments,
      );
      assert.equal(
        await InternalPayoutModel.countDocuments(),
        before.internalPayouts,
      );
      assert.equal(
        await InternalTopUpFunding.countDocuments(),
        before.topUpFundings,
      );
    } finally {
      await server.close();
    }
  });
};
