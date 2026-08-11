import assert from "node:assert/strict";
import { test } from "node:test";

import InternalPaymentModel from
  "../../../models/internalProvider/internalPayment.model";
import InternalPayoutModel from
  "../../../models/internalProvider/internalPayout.model";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payout } from "../../../models/payout.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { withdrawalProviderInitializationService } from
  "../../../services/financial/withdrawalProviderInitialization.service";
import {
  createReservedWithdrawalProviderFixture,
  snapshotFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderInitializationFixtures";

export const registerWithdrawalProviderRegressionTests = () => {
  test("phase9b preserves prior financial domains and performs no provider execution", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createReservedWithdrawalProviderFixture(server.baseUrl);
      const before = {
        financial: await snapshotFinancialState(fixture.creatorWallet._id),
        ledgerEntries: await LedgerEntry.countDocuments(),
        projections: await WalletProjectionOperation.countDocuments(),
        payouts: await Payout.countDocuments(),
        withdrawals: await Withdrawal.countDocuments(),
        internalPayments: await InternalPaymentModel.countDocuments(),
        internalPayouts: await InternalPayoutModel.countDocuments(),
        topUpFundings: await InternalTopUpFunding.countDocuments(),
      };
      await withdrawalProviderInitializationService.initialize(
        fixture.withdrawal.withdrawalReference,
      );
      assert.deepEqual(
        await snapshotFinancialState(fixture.creatorWallet._id),
        before.financial,
      );
      assert.equal(await LedgerEntry.countDocuments(), before.ledgerEntries);
      assert.equal(
        await WalletProjectionOperation.countDocuments(),
        before.projections,
      );
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
    } finally {
      await server.close();
    }
  });
};
