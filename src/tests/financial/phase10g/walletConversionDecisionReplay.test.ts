import assert from "node:assert/strict";
import { test } from "node:test";

import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { approve, captureNoMoneyState, createDecisionFixture, reject } from
  "./fixtures/walletConversionDecisionFixtures";

export const registerReplayTests = () => {
  test("phase10g approval replay preserves original actor/timestamp after balance change", async () => {
    const fixture = await createDecisionFixture();
    const firstNoMoney = await captureNoMoneyState();
    const first = await approve(fixture);
    assert.deepEqual(await captureNoMoneyState(), firstNoMoney);
    await Wallet.findByIdAndUpdate(fixture.request.sourceWalletId, { $set: {
      currentBalance: 1, availableBalance: 1,
    } }, { runValidators: true });
    const replayNoMoney = await captureNoMoneyState();
    const replay = await approve(fixture);
    assert.equal(replay.status, "APPROVED");
    assert.equal(replay.decidedAt?.toISOString(), first.decidedAt?.toISOString());
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_APPROVED" }), 1);
    assert.deepEqual(await captureNoMoneyState(), replayNoMoney);
    const otherAdmin = fixture.actors.creatorId;
    await assert.rejects(() => fixture.decisionService.decide({
      adminUserId: otherAdmin.toString(),
      conversionReference: fixture.created.conversionReference,
      decision: "APPROVE",
    }), (error: any) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
  });

  test("phase10g rejection replay requires exact normalized payload and actor", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const first = await reject(fixture, "OTHER", "  Bounded reason  ");
    const replay = await reject(fixture, "OTHER", "Bounded reason");
    assert.equal(replay.decidedAt?.toISOString(), first.decidedAt?.toISOString());
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_REJECTED" }), 1);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
    for (const conflicting of [
      { decision: "REJECT", rejectionCode: "OTHER",
        rejectionReason: "Different reason" },
      { decision: "REJECT", rejectionCode: "ADMIN_DECLINED",
        rejectionReason: "Bounded reason" },
      { decision: "APPROVE" },
    ]) {
      await assert.rejects(() => fixture.decisionService.decide({
        adminUserId: fixture.actors.adminId.toString(),
        conversionReference: fixture.created.conversionReference,
        ...conflicting,
      }), (error: any) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
    }
  });

  test("phase10g rejection after approval conflicts", async () => {
    const fixture = await createDecisionFixture();
    await approve(fixture);
    await assert.rejects(() => reject(fixture),
      (error: any) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
  });
};
