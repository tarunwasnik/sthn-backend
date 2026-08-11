import assert from "node:assert/strict";
import { test } from "node:test";

import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from "../../../models/internalProvider/internalPayment.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { bookingCreatorSettlementReconciliationService } from "../../../services/financial/bookingCreatorSettlementReconciliation.service";
import {
  createSettledOperationalFixture,
  startOperationalHttpServer,
} from "./fixtures/bookingCreatorSettlementOperationalFixtures";

export const registerBookingCreatorSettlementOperationalRegressionTests = () => {
  test("phase8f operational inspection creates no Wallet, accounting, provider, payout, withdrawal, or refund effect", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const counts = {
        ledger: await LedgerEntry.countDocuments(),
        projection: await WalletProjectionOperation.countDocuments(),
        internalPayment: await InternalPaymentModel.countDocuments(),
        topUp: await InternalTopUpFunding.countDocuments(),
        payout: await Payout.countDocuments(),
        withdrawal: await Withdrawal.countDocuments(),
        refund: await Refund.countDocuments(),
      };
      await bookingCreatorSettlementReconciliationService.reconcile(
        fixture.settlement.settlementReference,
      );
      assert.deepEqual({
        ledger: await LedgerEntry.countDocuments(),
        projection: await WalletProjectionOperation.countDocuments(),
        internalPayment: await InternalPaymentModel.countDocuments(),
        topUp: await InternalTopUpFunding.countDocuments(),
        payout: await Payout.countDocuments(),
        withdrawal: await Withdrawal.countDocuments(),
        refund: await Refund.countDocuments(),
      }, counts);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      await server.close();
    }
  });
};
