import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletConversionAccountingService } from
  "../../../services/financial/walletConversionAccounting.service";
import { WalletConversionProviderExecutionService } from
  "../../../services/financial/walletConversionProviderExecution.service";
import { approve, createDecisionFixture } from
  "../phase10g/fixtures/walletConversionDecisionFixtures";
import { uniqueKey } from "./fixtures/walletConversionAccountingFixtures";

export const registerTargetWalletRaceTests = () => {
  test("phase10i target-Wallet race creates exactly one currency Wallet",
    { timeout: 120_000 }, async () => {
    const fixture = await createDecisionFixture();
    const references = [fixture.created.conversionReference];
    for (let index = 0; index < 9; index += 1) {
      const created = await fixture.service.create(
        fixture.actors.userId.toString(), {
          sourceCurrency: "INR", targetCurrency: "USD",
          sourceAmount: 100_000, idempotencyKey: uniqueKey("phase10i-race"),
        });
      references.push(created.conversionReference);
    }
    await approve(fixture);
    for (const reference of references.slice(1)) {
      await fixture.decisionService.decide({
        adminUserId: fixture.actors.adminId.toString(),
        conversionReference: reference, decision: "APPROVE",
      });
    }
    const provider = new WalletConversionProviderExecutionService(
      fixture.requestService);
    for (const reference of references) {
      await provider.execute({
        adminUserId: fixture.actors.adminId.toString(),
        conversionReference: reference, outcome: "SUCCESS",
      });
    }
    assert.equal(await Wallet.countDocuments({ userId: fixture.actors.userId,
      currency: "USD" }), 0);
    const accounting = new WalletConversionAccountingService();
    const results = await Promise.all(references.map((reference) =>
      accounting.account(reference)));
    assert.ok(results.every((result) => result.status === "COMPLETED"));
    assert.equal(await Wallet.countDocuments({ userId: fixture.actors.userId,
      currency: "USD" }), 1);
    assert.equal(await LedgerEntry.countDocuments({
      type: "WALLET_CONVERSION_COMPLETED" }), 20);
    assert.equal(await WalletProjectionOperation.countDocuments({
      operationKey: /^wallet-conversion-accounting:/ }), 20);
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_COMPLETED" }), 10);
  });
};
