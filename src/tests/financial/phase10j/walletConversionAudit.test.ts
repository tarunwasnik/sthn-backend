import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRepairAction } from
  "../../../enums/financial/walletConversionRepairAction.enum";
import { walletConversionRepairService } from
  "../../../services/financial/walletConversionRepair.service";
import { createHealthyOperationalFixture, removeCompletionAudit } from
  "./fixtures/walletConversionOperationalFixtures";

export const registerAuditTests = () => {
  test("phase10j operational audit uses bounded safe metadata", async () => {
    const fixture = await createHealthyOperationalFixture();
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    await removeCompletionAudit(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    await walletConversionRepairService.repair(fixture.conversionReference,
      WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId);
    const audits = await WalletConversionAudit.find({
      conversionReference: fixture.conversionReference,
      action: { $in: ["WALLET_CONVERSION_RECONCILED",
        "WALLET_CONVERSION_REPAIRED"] },
    }).lean();
    assert.equal(audits.length, 2);
    assert.ok(audits.every((audit) => audit.reconciliationReference &&
      audit.classification && audit.severity &&
      !Object.prototype.hasOwnProperty.call(audit, "accountingFingerprint") &&
      !Object.prototype.hasOwnProperty.call(audit, "walletId") &&
      !Object.prototype.hasOwnProperty.call(audit, "ledgerId")));
  });
};
