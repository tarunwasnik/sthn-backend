import assert from "node:assert/strict";
import { test } from "node:test";

import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionProviderExecutionService } from
  "../../../services/financial/walletConversionProviderExecution.service";
import { captureFrozenFinancialState, createProviderFixture, executeFailure,
  executeSuccess } from "./fixtures/walletConversionProviderFixtures";

export const registerReplayTests = () => {
  test("phase10h terminal replay preserves result and never invokes simulator", async () => {
    const fixture = await createProviderFixture();
    const first = await executeSuccess(fixture);
    const frozen = await captureFrozenFinancialState();
    const replay = await executeSuccess(fixture);
    const reloaded = new WalletConversionProviderExecutionService(
      fixture.requestService);
    const reloadReplay = await reloaded.execute({
      adminUserId: fixture.actors.adminId.toString(),
      conversionReference: fixture.created.conversionReference,
      outcome: "SUCCESS",
    });
    assert.deepEqual(replay, first);
    assert.deepEqual(reloadReplay, first);
    assert.equal(fixture.executions, 1);
    assert.equal(await InternalProviderEvent.countDocuments({
      entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
    }), 4);
    assert.equal(await WalletConversionAudit.countDocuments({ action: { $in: [
      "WALLET_CONVERSION_PROVIDER_STARTED",
      "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
      "WALLET_CONVERSION_PROVIDER_FAILED",
    ] } }), 2);
    assert.deepEqual(await captureFrozenFinancialState(), frozen);
  });

  test("phase10h conflicting terminal outcome fails closed", async () => {
    const fixture = await createProviderFixture();
    await executeFailure(fixture);
    await assert.rejects(() => executeSuccess(fixture),
      (error: any) => error.code ===
        "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
    assert.equal(fixture.executions, 1);
  });
};
