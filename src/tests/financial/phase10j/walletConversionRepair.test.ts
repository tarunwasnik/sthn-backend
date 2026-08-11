import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRepairOperation } from
  "../../../models/walletConversionRepairOperation.model";
import { WalletConversionRepairAction } from
  "../../../enums/financial/walletConversionRepairAction.enum";
import { walletConversionRepairService } from
  "../../../services/financial/walletConversionRepair.service";
import { captureFinancialState, createHealthyOperationalFixture,
  removeCompletionAudit, removeLedgerReference } from
  "./fixtures/walletConversionOperationalFixtures";

export const registerRepairTests = () => {
  test("phase10j repair restores exactly one missing audit", async () => {
    const fixture = await createHealthyOperationalFixture();
    await removeCompletionAudit(fixture.conversionReference);
    const before = await captureFinancialState(fixture.conversionReference);
    const reconciled = await fixture.service.reconcile(
      fixture.conversionReference, fixture.adminId);
    assert.equal(reconciled.classification, "MISSING_AUDIT");
    assert.deepEqual(reconciled.allowedActions, [
      WalletConversionRepairAction.RESTORE_MISSING_AUDIT,
    ]);
    const result = await walletConversionRepairService.repair(
      fixture.conversionReference,
      WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId);
    assert.equal(result.classification, "HEALTHY");
    assert.equal(result.repairPerformed, true);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: fixture.conversionReference,
      action: "WALLET_CONVERSION_COMPLETED",
    }), 1);
    assert.deepEqual(await captureFinancialState(fixture.conversionReference),
      before);
  });

  test("phase10j repair restores a missing Ledger reference only", async () => {
    const fixture = await createHealthyOperationalFixture();
    await removeLedgerReference(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const result = await walletConversionRepairService.repair(
      fixture.conversionReference,
      WalletConversionRepairAction.RESTORE_LEDGER_REFERENCES, fixture.adminId);
    assert.equal(result.classification, "HEALTHY");
    assert.equal(await WalletConversionRepairOperation.countDocuments({}), 1);
  });

  test("phase10j ten repairs produce one repair authority", async () => {
    const fixture = await createHealthyOperationalFixture();
    await removeCompletionAudit(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      walletConversionRepairService.repair(fixture.conversionReference,
        WalletConversionRepairAction.RESTORE_MISSING_AUDIT,
        fixture.adminId)));
    assert.ok(results.every((value) => value.repairPerformed));
    assert.equal(await WalletConversionRepairOperation.countDocuments({}), 1);
  });
};
