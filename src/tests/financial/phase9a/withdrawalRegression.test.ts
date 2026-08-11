import assert from "node:assert/strict";
import { test } from "node:test";

import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import InternalPayoutModel from "../../../models/internalProvider/internalPayout.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { bookingCreatorSettlementOperationalInspectionService } from "../../../services/financial/bookingCreatorSettlementOperationalInspection.service";
import {
  createEligibleCreatorWithdrawalFixture,
  postCreatorWithdrawal,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalRegressionTests = () => {
  test("phase9a authenticated endpoint reserves only and preserves Phase 8F integrity", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      const before = {
        payouts: await Payout.countDocuments(),
        withdrawals: await Withdrawal.countDocuments(),
        internalPayments: await InternalPaymentModel.countDocuments(),
        internalPayouts: await InternalPayoutModel.countDocuments(),
        topUpFundings: await InternalTopUpFunding.countDocuments(),
        refunds: await Refund.countDocuments(),
      };
      const response = await postCreatorWithdrawal(
        server.baseUrl,
        fixture.creatorToken,
        {
          amount: fixture.input.amount.amount,
          currency: fixture.input.amount.currency,
          destinationReference: fixture.input.destinationReference,
          idempotencyKey: fixture.input.idempotencyKey,
        },
      );
      assert.equal(response.status, 201);
      assert.equal(
        (response.body.data as { status?: string }).status,
        "RESERVED",
      );
      assert.equal("_id" in (response.body.data as object), false);
      assert.equal(await Payout.countDocuments(), before.payouts);
      assert.equal(await Withdrawal.countDocuments(), before.withdrawals);
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
      assert.equal(await Refund.countDocuments(), before.refunds);
      const inspection =
        await bookingCreatorSettlementOperationalInspectionService.inspect(
          fixture.settlement.settlementReference,
        );
      assert.equal(inspection.classification, "HEALTHY");
    } finally {
      await server.close();
    }
  });
};
