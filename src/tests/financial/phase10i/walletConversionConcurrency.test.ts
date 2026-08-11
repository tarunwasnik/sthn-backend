import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { account, createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";

export const registerConcurrencyTests = () => {
  test("phase10i concurrency: ten attempts converge on one accounting graph", async () => {
    const fixture = await createAccountingFixture();
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      account(fixture)));
    assert.ok(results.every((result) => result.status === "COMPLETED"));
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+accountingTransactionReference +sourceProjectionReference " +
      "+targetProjectionReference").orFail();
    assert.equal(await LedgerEntry.countDocuments({
      transactionId: request.accountingTransactionReference }), 2);
    assert.equal(await WalletProjectionOperation.countDocuments({
      operationReference: { $in: [request.sourceProjectionReference!,
        request.targetProjectionReference!] },
    }), 2);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: request.conversionReference,
      action: "WALLET_CONVERSION_COMPLETED",
    }), 1);
  });
};
