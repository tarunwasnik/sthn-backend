import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionReconciliation } from
  "../../../models/walletConversionReconciliation.model";
import { walletConversionReconciliationService } from
  "../../../services/financial/walletConversionReconciliation.service";
import { createHealthyOperationalFixture } from
  "./fixtures/walletConversionOperationalFixtures";

export const registerReconciliationTests = () => {
  test("phase10j reconciliation classifies a healthy full graph", async () => {
    const fixture = await createHealthyOperationalFixture();
    const result = await fixture.service.reconcile(fixture.conversionReference,
      fixture.adminId);
    assert.deepEqual(Object.keys(result).sort(), ["allowedActions",
      "classification", "conversionReference", "issues",
      "reconciliationReference", "repairPerformed", "retryPerformed",
      "severity"].sort());
    assert.match(result.reconciliationReference, /^WCR-[A-F0-9]{20}$/);
    assert.deepEqual(result.allowedActions, []);
    assert.equal(result.classification, "HEALTHY");
    assert.equal(result.severity, "INFO");
    assert.deepEqual(result.issues, []);
    assert.equal(await WalletConversionReconciliation.countDocuments({}), 1);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: fixture.conversionReference,
      action: "WALLET_CONVERSION_RECONCILED",
    }), 1);
  });

  test("phase10j reconciliation replay validates the entire graph", async () => {
    const fixture = await createHealthyOperationalFixture();
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const replay = await walletConversionReconciliationService.validateReplay(
      fixture.conversionReference);
    assert.equal(replay.classification, "HEALTHY");
    assert.equal(await WalletConversionReconciliation.countDocuments({}), 1);
  });

  test("phase10j ten concurrent reconciliation calls converge", async () => {
    const fixture = await createHealthyOperationalFixture();
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      fixture.service.reconcile(fixture.conversionReference, fixture.adminId)));
    assert.ok(results.every((value) => value.classification === "HEALTHY"));
    assert.equal(await WalletConversionReconciliation.countDocuments({}), 1);
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_RECONCILED",
    }), 1);
  });
};
