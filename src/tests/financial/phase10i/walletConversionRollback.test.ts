import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletConversionAccountingStage } from
  "../../../services/financial/walletConversionAccounting.service";
import { account, createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";

export const registerRollbackTests = () => {
  for (const stage of ["AFTER_WALLET_CREATION", "AFTER_LEDGER",
    "AFTER_SOURCE_PROJECTION", "AFTER_TARGET_PROJECTION", "BEFORE_COMPLETED",
    "BEFORE_AUDIT", "BEFORE_COMMIT"] as WalletConversionAccountingStage[]) {
    test(`phase10i rollback: ${stage} rolls back the accounting transaction`,
      async () => {
        const fixture = await createAccountingFixture({
          failureInjector: (point) => {
            if (point === stage) throw new Error(`Injected ${stage}`);
          },
        });
        const walletBefore = await Wallet.findById(
          fixture.request.sourceWalletId).lean().orFail();
        await assert.rejects(() => account(fixture));
        const request = await WalletConversionRequest.findOne({
          conversionReference: fixture.created.conversionReference,
        }).select("+userId +sourceWalletId +accountingTransactionReference")
          .orFail();
        assert.equal(request.status, "APPROVED");
        assert.equal(request.providerStatus, "SUCCEEDED");
        assert.equal(request.accountingReference, undefined);
        assert.equal(request.accountingTransactionReference, undefined);
        assert.equal(await Wallet.countDocuments({ userId: request.userId,
          currency: request.targetCurrency }), 0);
        assert.deepEqual(await Wallet.findById(request.sourceWalletId).lean(),
          walletBefore);
        assert.equal(await LedgerEntry.countDocuments({
          "metadata.conversionReference": request.conversionReference }), 0);
        assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
        assert.equal(await WalletConversionAudit.countDocuments({
          conversionReference: request.conversionReference,
          action: "WALLET_CONVERSION_COMPLETED",
        }), 0);
      });
  }
};
