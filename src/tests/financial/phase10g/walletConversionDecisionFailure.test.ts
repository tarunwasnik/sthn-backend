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
import { WalletConversionDecisionFailurePoint } from
  "../../../services/financial/adminWalletConversionDecision.service";
import { approve, captureNoMoneyState, createDecisionFixture } from
  "./fixtures/walletConversionDecisionFixtures";

export const registerFailureTests = () => {
  for (const point of ["AFTER_REQUEST_VALIDATION",
    "AFTER_SNAPSHOT_VALIDATION", "AFTER_SOURCE_WALLET_PRECHECK",
    "AFTER_GUARDED_TRANSITION", "BEFORE_AUDIT", "AFTER_AUDIT",
    "BEFORE_COMMIT"] as const) {
    test(`phase10g rollback: ${point} leaves no partial decision`, async () => {
      const fixture = await createDecisionFixture({
        failureInjector: (actual: WalletConversionDecisionFailurePoint) => {
          if (actual === point) throw new Error(`Injected ${point}`);
        },
      });
      const noMoneyBefore = await captureNoMoneyState();
      const walletBefore = await Wallet.findById(
        fixture.request.sourceWalletId).lean();
      await assert.rejects(() => approve(fixture));
      const request = await WalletConversionRequest.findOne({})
        .select("+decidedBy");
      assert.equal(request?.status, "PENDING");
      assert.equal(request?.decidedAt, undefined);
      assert.equal(request?.decidedBy, undefined);
      assert.equal(await WalletConversionAudit.countDocuments({ action: {
        $in: ["WALLET_CONVERSION_APPROVED", "WALLET_CONVERSION_REJECTED"],
      } }), 0);
      assert.deepEqual(await Wallet.findById(fixture.request.sourceWalletId).lean(),
        walletBefore);
      assert.equal(await LedgerEntry.countDocuments({}), 0);
      assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
      assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
    });
  }
};
