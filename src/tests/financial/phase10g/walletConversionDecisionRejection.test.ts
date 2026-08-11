import assert from "node:assert/strict";
import { test } from "node:test";

import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { captureNoMoneyState, createDecisionFixture, reject } from
  "./fixtures/walletConversionDecisionFixtures";

export const registerRejectionTests = () => {
  test("phase10g rejection persists bounded normalized metadata and User DTO", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const providerCalls = fixture.provider.callCount;
    const walletBefore = await Wallet.findById(fixture.request.sourceWalletId).lean();
    const result = await reject(fixture, "INVALID_REQUEST", "  Invalid quote  ");
    assert.deepEqual({ status: result.status, decision: result.decision,
      rejectionCode: result.rejectionCode,
      rejectionReason: result.rejectionReason }, {
      status: "REJECTED", decision: "REJECT",
      rejectionCode: "INVALID_REQUEST",
      rejectionReason: "Invalid quote",
    });
    assert.equal(result.rejectedAt?.toISOString(),
      fixture.decisionNow.toISOString());
    assert.equal(result.approvedAt, undefined);
    const own = await fixture.requestService.getOwn(
      fixture.actors.userId.toString(), fixture.created.conversionReference,
    );
    assert.equal(own.status, "REJECTED");
    assert.equal(own.rejectionReason, "Invalid quote");
    assert.deepEqual(await Wallet.findById(fixture.request.sourceWalletId).lean(),
      walletBefore);
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_REJECTED", rejectionCode: "INVALID_REQUEST",
    }), 1);
    assert.equal(fixture.provider.callCount, providerCalls);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });

  test("phase10g rejection validates bounded code/reason and approval data rules", async () => {
    const fixture = await createDecisionFixture();
    for (const input of [
      { decision: "REJECT" },
      { decision: "REJECT", rejectionCode: "UNBOUNDED" },
      { decision: "REJECT", rejectionCode: "OTHER", rejectionReason: " " },
      { decision: "REJECT", rejectionCode: "OTHER",
        rejectionReason: "x".repeat(501) },
      { decision: "APPROVE", rejectionCode: "ADMIN_DECLINED" },
      { decision: "APPROVE", rejectionReason: "not allowed" },
      { decision: "UNKNOWN" },
    ]) {
      await assert.rejects(() => fixture.decisionService.decide({
        adminUserId: fixture.actors.adminId.toString(),
        conversionReference: fixture.created.conversionReference, ...input,
      }));
    }
    assert.equal((await WalletConversionRequest.findOne({}))?.status, "PENDING");
  });
};
