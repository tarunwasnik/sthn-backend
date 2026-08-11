import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { account, createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";

export const registerReplayTests = () => {
  test("phase10i completed replay validates and creates no duplicate effect", async () => {
    const fixture = await createAccountingFixture();
    const first = await account(fixture);
    const before = {
      wallets: await Wallet.find({}).sort({ _id: 1 }).lean(),
      ledger: await LedgerEntry.countDocuments({}),
      projections: await WalletProjectionOperation.countDocuments({}),
      audits: await WalletConversionAudit.countDocuments({}),
    };
    const replay = await account(fixture);
    assert.deepEqual(replay, first);
    assert.deepEqual(await Wallet.find({}).sort({ _id: 1 }).lean(),
      before.wallets);
    assert.equal(await LedgerEntry.countDocuments({}), before.ledger);
    assert.equal(await WalletProjectionOperation.countDocuments({}),
      before.projections);
    assert.equal(await WalletConversionAudit.countDocuments({}), before.audits);
    assert.equal(fixture.executions, 1);
    const decisionReplay = await fixture.decisionService.decide({
      adminUserId: fixture.actors.adminId.toString(),
      conversionReference: fixture.created.conversionReference,
      decision: "APPROVE",
    });
    assert.equal(decisionReplay.status, "COMPLETED");
    assert.equal(decisionReplay.decision, "APPROVE");
  });
};
