import assert from "node:assert/strict";
import { test } from "node:test";

import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletConversionProviderExecutionStage } from
  "../../../services/financial/walletConversionProviderExecution.service";
import { captureFrozenFinancialState, createProviderFixture, executeSuccess } from
  "./fixtures/walletConversionProviderFixtures";

export const registerFailureTests = () => {
  for (const stage of ["AFTER_AUTHORITY", "AFTER_PROCESSING",
    "AFTER_EVENT_CREATION", "AFTER_TERMINAL_STATE",
    "BEFORE_REQUEST_SYNCHRONIZATION", "BEFORE_AUDIT",
    "BEFORE_COMMIT"] as const) {
    test(`phase10h rollback: ${stage} preserves INITIALIZED authority`, async () => {
      const fixture = await createProviderFixture({
        failureInjector: (actual: WalletConversionProviderExecutionStage) => {
          if (actual === stage) throw new Error(`Injected ${stage}`);
        },
      });
      const frozen = await captureFrozenFinancialState();
      await assert.rejects(() => executeSuccess(fixture));
      const authority = await InternalWalletConversionProviderRequest.findOne({
        conversionReference: fixture.created.conversionReference,
      }).orFail();
      assert.equal(authority.providerStatus, "INITIALIZED");
      assert.equal(authority.version, 0);
      assert.equal(authority.isTerminal, false);
      assert.equal(authority.processingAt, undefined);
      assert.equal(authority.completedAt, undefined);
      assert.equal(await InternalProviderEvent.countDocuments({
        entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
      }), 2);
      assert.equal(await WalletConversionAudit.countDocuments({ action: { $in: [
        "WALLET_CONVERSION_PROVIDER_STARTED",
        "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
        "WALLET_CONVERSION_PROVIDER_FAILED",
      ] } }), 0);
      const request = await WalletConversionRequest.findOne({
        conversionReference: fixture.created.conversionReference,
      }).orFail();
      assert.equal(request.status, "APPROVED");
      assert.equal(request.providerRequestReference, undefined);
      assert.equal(request.providerStatus, undefined);
      assert.deepEqual(await captureFrozenFinancialState(), frozen);
    });
  }
};
