import assert from "node:assert/strict";
import { test } from "node:test";

import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { captureFrozenFinancialState, createProviderFixture, executeSuccess } from
  "./fixtures/walletConversionProviderFixtures";

export const registerConcurrencyTests = () => {
  test("phase10h concurrency: ten attempts converge on one execution authority", async () => {
    const fixture = await createProviderFixture();
    const frozen = await captureFrozenFinancialState();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      executeSuccess(fixture)));
    assert.ok(settled.every((item) => item.status === "fulfilled"),
      settled.map((item) => item.status === "fulfilled" ? "fulfilled" :
        String(item.reason)).join(" | "));
    assert.equal(fixture.executions, 1);
    assert.equal(await InternalWalletConversionProviderRequest.countDocuments({
      providerStatus: "SUCCEEDED",
    }), 1);
    assert.equal(await InternalProviderEvent.countDocuments({
      entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
    }), 4);
    assert.equal(await WalletConversionAudit.countDocuments({ action: { $in: [
      "WALLET_CONVERSION_PROVIDER_STARTED",
      "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
    ] } }), 2);
    assert.deepEqual(await captureFrozenFinancialState(), frozen);
  });
};
