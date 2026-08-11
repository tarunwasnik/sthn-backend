import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { account, createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";

export const registerAccountingTests = () => {
  test("phase10i completes cross-currency Ledger and Wallet accounting", async () => {
    const fixture = await createAccountingFixture();
    const sourceBefore = await Wallet.findById(fixture.request.sourceWalletId)
      .orFail();
    const result = await account(fixture);
    assert.deepEqual(Object.keys(result).sort(), ["completedAt",
      "conversionReference", "sourceAmount", "sourceCurrency", "status",
      "targetAmount", "targetCurrency"].sort());
    assert.equal(result.status, "COMPLETED");
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+conversionKey +userId +sourceWalletId +targetWalletId " +
      "+accountingKey +accountingFingerprint " +
      "+accountingTransactionReference +accountingTargetWalletId " +
      "+sourceProjectionReference +targetProjectionReference " +
      "+sourceWalletVersion +targetWalletVersion").orFail();
    assert.equal(request.status, "COMPLETED");
    assert.match(request.accountingReference!, /^WCA-/);
    assert.match(request.accountingTransactionReference!, /^WCAT-/);
    assert.equal(request.accountingFingerprint?.length, 64);
    const [sourceWallet, targetWallet] = await Promise.all([
      Wallet.findById(request.sourceWalletId).orFail(),
      Wallet.findById(request.accountingTargetWalletId).orFail(),
    ]);
    assert.equal(sourceWallet.availableBalance,
      sourceBefore.availableBalance - request.sourceAmount);
    assert.equal(targetWallet.availableBalance, request.targetAmount);
    assert.equal(sourceWallet.currentBalance, sourceWallet.availableBalance);
    assert.equal(targetWallet.currentBalance, targetWallet.availableBalance);
    assert.equal(sourceWallet.projectionVersion, 1);
    assert.equal(targetWallet.projectionVersion, 1);
    const entries = await LedgerEntry.find({
      transactionId: request.accountingTransactionReference,
    }).select("+postingKey").sort({ direction: 1 });
    assert.equal(entries.length, 2);
    const debit = entries.find((entry) => entry.direction === "DEBIT")!;
    const credit = entries.find((entry) => entry.direction === "CREDIT")!;
    assert.equal(debit.type, "WALLET_CONVERSION_COMPLETED");
    assert.equal(debit.source, "WALLET_CONVERSION");
    assert.equal(debit.account, "WALLET_AVAILABLE");
    assert.equal(debit.amount, request.sourceAmount);
    assert.equal(debit.currency, request.sourceCurrency);
    assert.ok(debit.walletId?.equals(sourceWallet._id));
    assert.equal(credit.amount, request.targetAmount);
    assert.equal(credit.currency, request.targetCurrency);
    assert.ok(credit.walletId?.equals(targetWallet._id));
    const projections = await WalletProjectionOperation.find({
      operationReference: { $in: [request.sourceProjectionReference!,
        request.targetProjectionReference!] },
    });
    assert.equal(projections.length, 2);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: request.conversionReference,
      action: "WALLET_CONVERSION_COMPLETED",
    }), 1);
  });

  test("phase10i reuses an existing target Wallet", async () => {
    const fixture = await createAccountingFixture({ createTargetWallet: true });
    const targetBefore = await Wallet.findOne({ userId: fixture.request.userId,
      currency: fixture.request.targetCurrency }).orFail();
    const countBefore = await Wallet.countDocuments({
      userId: fixture.request.userId, currency: fixture.request.targetCurrency,
    });
    await account(fixture);
    const targetAfter = await Wallet.findById(targetBefore._id).orFail();
    assert.equal(await Wallet.countDocuments({ userId: fixture.request.userId,
      currency: fixture.request.targetCurrency }), countBefore);
    assert.equal(targetAfter.availableBalance,
      targetBefore.availableBalance + fixture.request.targetAmount);
  });
};
