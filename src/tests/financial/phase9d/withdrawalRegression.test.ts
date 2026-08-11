import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalPayout from
  "../../../models/internalProvider/internalPayout.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { PayoutDestination } from
  "../../../models/payoutDestination.model";
import { creatorWithdrawalFinalizationService } from
  "../../../services/financial/creatorWithdrawalFinalization.service";
import { withdrawalProviderExecutionService } from
  "../../../services/financial/withdrawalProviderExecution.service";
import {
  createTerminalWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalRegressionTests = () => {
  test("phase9d does not execute providers or touch legacy financial domains", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createTerminalWithdrawalFixture(
        server.baseUrl,
        WithdrawalProviderExecutionOutcome.SUCCESS,
      );
      const destinationBefore = await PayoutDestination.findById(
        fixture.destination._id,
      ).lean().orFail();
      const legacyBefore = await Promise.all([
        InternalPayout.countDocuments(), Payout.countDocuments(),
        Withdrawal.countDocuments(), Refund.countDocuments(),
      ]);
      await creatorWithdrawalFinalizationService.finalize(
        fixture.withdrawal.withdrawalReference,
      );
      await withdrawalProviderExecutionService.validateReplay(
        fixture.withdrawal.withdrawalReference,
        WithdrawalProviderExecutionOutcome.SUCCESS,
      );
      assert.deepEqual(await Promise.all([
        InternalPayout.countDocuments(), Payout.countDocuments(),
        Withdrawal.countDocuments(), Refund.countDocuments(),
      ]), legacyBefore);
      assert.deepEqual(await PayoutDestination.findById(
        fixture.destination._id,
      ).lean().orFail(), destinationBefore);
      const indexes = await CreatorWithdrawalRequest.collection.indexes();
      const keys = indexes.map((index) => JSON.stringify(index.key));
      for (const expected of [
        { finalizationReference: 1 }, { finalizationKey: 1 },
        { finalizationTransactionId: 1 },
        { finalizationProjectionOperationReference: 1 },
        { status: 1, completedAt: -1 }, { status: 1, failedAt: -1 },
        { walletId: 1, status: 1 }, { creatorId: 1, status: 1 },
        { providerRequestReference: 1 },
      ]) assert.ok(keys.includes(JSON.stringify(expected)));
    } finally {
      await server.close();
    }
  });
};
