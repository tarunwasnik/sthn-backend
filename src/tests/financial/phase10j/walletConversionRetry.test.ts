import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletConversionRetryAttempt } from
  "../../../models/walletConversionRetryAttempt.model";
import { walletConversionRetryService } from
  "../../../services/financial/walletConversionRetry.service";
import { captureFinancialState, createHealthyOperationalFixture,
  makeReplayRequired } from "./fixtures/walletConversionOperationalFixtures";

export const registerRetryTests = () => {
  test("phase10j retry completes metadata only after financial proof", async () => {
    const fixture = await createHealthyOperationalFixture();
    await makeReplayRequired(fixture.conversionReference);
    const before = await captureFinancialState(fixture.conversionReference);
    const reconciled = await fixture.service.reconcile(
      fixture.conversionReference, fixture.adminId);
    assert.equal(reconciled.classification, "REPLAY_REQUIRED");
    assert.deepEqual(reconciled.allowedActions, ["RETRY"]);
    const result = await walletConversionRetryService.retry(
      fixture.conversionReference, fixture.adminId);
    assert.equal(result.classification, "HEALTHY");
    assert.equal(result.retryPerformed, true);
    assert.equal((await WalletConversionRequest.findOne({
      conversionReference: fixture.conversionReference }).orFail()).status,
    "COMPLETED");
    assert.equal(await WalletConversionRetryAttempt.countDocuments({}), 1);
    assert.deepEqual(await captureFinancialState(fixture.conversionReference),
      before);
    assert.equal((await walletConversionRetryService.validateReplay(
      fixture.conversionReference)).retryPerformed, true);
  });

  test("phase10j ten retry attempts produce one retry authority", async () => {
    const fixture = await createHealthyOperationalFixture();
    await makeReplayRequired(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      walletConversionRetryService.retry(fixture.conversionReference,
        fixture.adminId)));
    assert.ok(results.every((value) => value.retryPerformed));
    assert.equal(await WalletConversionRetryAttempt.countDocuments({}), 1);
  });
};
