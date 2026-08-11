import assert from "node:assert/strict";
import { test } from "node:test";

import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletConversionAccountingService } from
  "../../../services/financial/walletConversionAccounting.service";
import { createDecisionFixture } from
  "../phase10g/fixtures/walletConversionDecisionFixtures";
import { account, createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";

const code = (expected: string) => (error: any) => error.code === expected;

export const registerIntegrityTests = () => {
  test("phase10i permits only provider-terminal approved requests", async () => {
    const pending = await createDecisionFixture();
    await assert.rejects(() => new WalletConversionAccountingService().account(
      pending.created.conversionReference),
    code("WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS"));
  });

  test("phase10i rejects insufficient source Wallet balance atomically", async () => {
    const fixture = await createAccountingFixture();
    await Wallet.updateOne({ _id: fixture.request.sourceWalletId }, { $set: {
      availableBalance: fixture.request.sourceAmount - 1,
      currentBalance: fixture.request.sourceAmount - 1,
    } });
    await assert.rejects(() => account(fixture),
      code("WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE"));
    assert.equal(await LedgerEntry.countDocuments({
      type: "WALLET_CONVERSION_COMPLETED" }), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
  });

  test("phase10i rejects corrupted provider identity", async () => {
    const fixture = await createAccountingFixture();
    await InternalWalletConversionProviderRequest.collection.updateOne({
      conversionReference: fixture.created.conversionReference,
    }, { $inc: { sourceAmount: 1 } });
    await assert.rejects(() => account(fixture),
      code("WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT"));
  });

  test("phase10i replay rejects missing Ledger and corrupted Wallet", async () => {
    const first = await createAccountingFixture();
    await account(first);
    const request = await WalletConversionRequest.findOne({
      conversionReference: first.created.conversionReference,
    }).select("+accountingTransactionReference").orFail();
    await LedgerEntry.deleteOne({
      transactionId: request.accountingTransactionReference,
      direction: "DEBIT",
    });
    await assert.rejects(() => account(first),
      code("WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT"));

    const second = await createAccountingFixture();
    await account(second);
    const completed = await WalletConversionRequest.findOne({
      conversionReference: second.created.conversionReference,
    }).select("+accountingTargetWalletId").orFail();
    await Wallet.collection.updateOne({ _id: completed.accountingTargetWalletId },
      { $inc: { currentBalance: 1 } });
    await assert.rejects(() => account(second),
      code("WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT"));
  });
};
