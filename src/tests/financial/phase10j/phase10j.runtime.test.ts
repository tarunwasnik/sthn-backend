/// <reference path="../../../types/express.d.ts" />

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionReconciliation } from
  "../../../models/walletConversionReconciliation.model";
import { WalletConversionRepairOperation } from
  "../../../models/walletConversionRepairOperation.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletConversionRetryAttempt } from
  "../../../models/walletConversionRetryAttempt.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletConversionRepairAction } from
  "../../../enums/financial/walletConversionRepairAction.enum";
import { WalletConversionReconciliationService } from
  "../../../services/financial/walletConversionReconciliation.service";
import { WalletConversionRepairService } from
  "../../../services/financial/walletConversionRepair.service";
import { WalletConversionRetryService } from
  "../../../services/financial/walletConversionRetry.service";
import { clearPhase7HDatabase, connectPhase7HDatabase,
  disconnectPhase7HDatabase } from "../phase7h/helpers/database";
import { registerAuditTests } from "./walletConversionAudit.test";
import { registerReconciliationTests } from
  "./walletConversionReconciliation.test";
import { registerRegressionTests } from
  "./walletConversionRegression.test";
import { registerRepairTests } from "./walletConversionRepair.test";
import { registerRetryTests } from "./walletConversionRetry.test";
import { captureFinancialState, createHealthyOperationalFixture,
  makeReplayRequired, removeCompletionAudit } from
  "./fixtures/walletConversionOperationalFixtures";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10j-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), Wallet.init(),
    LedgerEntry.init(), WalletProjectionOperation.init(),
    WalletConversionRequest.init(), WalletConversionAudit.init(),
    InternalWalletConversionProviderRequest.init(),
    WalletConversionReconciliation.init(),
    WalletConversionRetryAttempt.init(),
    WalletConversionRepairOperation.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerReconciliationTests();
registerRetryTests();
registerRepairTests();
registerAuditTests();
registerRegressionTests();

test("phase10j reconciliation rollback boundaries leave no authority", async () => {
  for (const stage of ["AFTER_RECONCILIATION", "BEFORE_AUDIT",
    "BEFORE_COMMIT"] as const) {
    await clearPhase7HDatabase();
    const fixture = await createHealthyOperationalFixture();
    const before = await captureFinancialState(fixture.conversionReference);
    const service = new WalletConversionReconciliationService({
      failureInjector: (current) => {
        if (current === stage) throw new Error(`injected-${stage}`);
      },
    });
    await assert.rejects(() => service.reconcile(fixture.conversionReference,
      fixture.adminId));
    assert.equal(await WalletConversionReconciliation.countDocuments({}), 0);
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_RECONCILED",
    }), 0);
    assert.deepEqual(await captureFinancialState(fixture.conversionReference),
      before);
  }
});

test("phase10j retry rollback after retry preserves accounting", async () => {
  const fixture = await createHealthyOperationalFixture();
  await makeReplayRequired(fixture.conversionReference);
  await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
  const before = await captureFinancialState(fixture.conversionReference);
  const service = new WalletConversionRetryService({
    failureInjector: (stage) => {
      if (stage === "AFTER_RETRY") throw new Error("injected-after-retry");
    },
  });
  await assert.rejects(() => service.retry(fixture.conversionReference,
    fixture.adminId));
  assert.equal(await WalletConversionRetryAttempt.countDocuments({}), 0);
  assert.equal((await WalletConversionRequest.findOne({
    conversionReference: fixture.conversionReference }).orFail()).status,
  "APPROVED");
  assert.deepEqual(await captureFinancialState(fixture.conversionReference),
    before);
});

test("phase10j repair rollback after repair and before commit is atomic", async () => {
  for (const stage of ["AFTER_REPAIR", "BEFORE_COMMIT"] as const) {
    await clearPhase7HDatabase();
    const fixture = await createHealthyOperationalFixture();
    await removeCompletionAudit(fixture.conversionReference);
    await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
    const before = await captureFinancialState(fixture.conversionReference);
    const service = new WalletConversionRepairService({
      failureInjector: (current) => {
        if (current === stage) throw new Error(`injected-${stage}`);
      },
    });
    await assert.rejects(() => service.repair(fixture.conversionReference,
      WalletConversionRepairAction.RESTORE_MISSING_AUDIT, fixture.adminId));
    assert.equal(await WalletConversionRepairOperation.countDocuments({}), 0);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: fixture.conversionReference,
      action: "WALLET_CONVERSION_COMPLETED",
    }), 0);
    assert.deepEqual(await captureFinancialState(fixture.conversionReference),
      before);
  }
});
