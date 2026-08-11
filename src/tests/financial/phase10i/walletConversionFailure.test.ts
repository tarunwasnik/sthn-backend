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

export const registerFailureTests = () => {
  test("phase10i provider failure finalizes FAILED without accounting", async () => {
    const fixture = await createAccountingFixture({ providerOutcome: "FAILURE" });
    const walletsBefore = await Wallet.find({}).sort({ _id: 1 }).lean();
    const result = await account(fixture);
    assert.equal(result.status, "FAILED");
    assert.equal(result.completedAt, undefined);
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+accountingTransactionReference +accountingTargetWalletId " +
      "+sourceProjectionReference +targetProjectionReference").orFail();
    assert.equal(request.status, "FAILED");
    assert.ok(request.failedAt);
    assert.equal(request.accountingReference, undefined);
    assert.equal(request.accountingTransactionReference, undefined);
    assert.equal(await LedgerEntry.countDocuments({
      "metadata.conversionReference": request.conversionReference }), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.deepEqual(await Wallet.find({}).sort({ _id: 1 }).lean(),
      walletsBefore);
    assert.equal(await WalletConversionAudit.countDocuments({
      conversionReference: request.conversionReference,
      action: "WALLET_CONVERSION_FAILED",
    }), 1);
    assert.deepEqual(await account(fixture), result);
  });
};
