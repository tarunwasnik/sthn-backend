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
import { WalletConversionFailurePoint } from
  "../../../services/financial/walletConversionRequest.service";
import { createConversionFixture, requestInput } from
  "./fixtures/walletConversionRequestFixtures";

export const registerFailureTests = () => {
  for (const point of ["AFTER_SOURCE_WALLET_VALIDATION",
    "AFTER_SNAPSHOT_RESOLUTION", "AFTER_TARGET_AMOUNT_CALCULATION",
    "AFTER_REQUEST_CREATION", "BEFORE_AUDIT", "BEFORE_COMMIT"] as const) {
    test(`phase10f rollback: ${point} leaves no request or money effect`,
      async () => {
        const fixture = await createConversionFixture({
          failureInjector: (actual: WalletConversionFailurePoint) => {
            if (actual === point) throw new Error(`Injected ${point}`);
          },
        });
        const before = await Wallet.findById(fixture.actors.wallet._id).lean();
        await assert.rejects(() => fixture.service.create(
          fixture.actors.userId.toString(), requestInput(`phase10f-${point}`),
        ));
        assert.equal(await WalletConversionRequest.countDocuments({}), 0);
        assert.equal(await WalletConversionAudit.countDocuments({}), 0);
        assert.equal(await LedgerEntry.countDocuments({}), 0);
        assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
        assert.deepEqual(await Wallet.findById(fixture.actors.wallet._id).lean(),
          before);
        assert.equal(await Wallet.countDocuments({ userId: fixture.actors.userId,
          currency: "USD" }), 0);
      });
  }
};
