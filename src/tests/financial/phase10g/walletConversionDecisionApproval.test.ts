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
import { approve, captureNoMoneyState, createDecisionFixture } from
  "./fixtures/walletConversionDecisionFixtures";

const immutableGraph = (request: any) => ({
  conversionReference: request.conversionReference,
  conversionKey: request.conversionKey,
  userId: request.userId.toString(),
  sourceWalletId: request.sourceWalletId.toString(),
  targetWalletId: request.targetWalletId?.toString(),
  sourceCurrency: request.sourceCurrency, targetCurrency: request.targetCurrency,
  sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
  fxSnapshotId: request.fxSnapshotId.toString(),
  fxSnapshotReference: request.fxSnapshotReference,
  fxProvider: request.fxProvider,
  fxEffectiveDate: request.fxEffectiveDate.toISOString(),
  rateValue: request.rateValue, rateScale: request.rateScale,
  inverseRateValue: request.inverseRateValue,
  inverseRateScale: request.inverseRateScale,
  sourceMinorUnits: request.sourceMinorUnits,
  targetMinorUnits: request.targetMinorUnits,
  idempotencyKey: request.idempotencyKey,
  requestFingerprint: request.requestFingerprint,
  requestedAt: request.requestedAt.toISOString(),
});

export const registerApprovalTests = () => {
  test("phase10g approval records only the guarded Admin decision", async () => {
    const fixture = await createDecisionFixture();
    const beforeGraph = immutableGraph(fixture.request);
    const noMoneyBefore = await captureNoMoneyState();
    const walletBefore = await Wallet.findById(fixture.request.sourceWalletId).lean();
    const providerCalls = fixture.provider.callCount;
    const result = await approve(fixture);
    const stored = await WalletConversionRequest.findOne({
      conversionReference: result.conversionReference,
    }).select("+conversionKey +userId +sourceWalletId +targetWalletId +fxSnapshotId " +
      "+rateValue +rateScale +inverseRateValue +inverseRateScale " +
      "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
      "+decidedBy");
    assert.equal(result.status, "APPROVED");
    assert.equal(result.decision, "APPROVE");
    assert.equal(result.decidedAt?.toISOString(), fixture.decisionNow.toISOString());
    assert.equal(result.approvedAt?.toISOString(),
      fixture.decisionNow.toISOString());
    assert.equal(result.rejectedAt, undefined);
    assert.ok(stored?.decidedBy?.equals(fixture.actors.adminId));
    assert.deepEqual(immutableGraph(stored), beforeGraph);
    assert.deepEqual(await Wallet.findById(fixture.request.sourceWalletId).lean(),
      walletBefore);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_APPROVED" }), 1);
    assert.equal(fixture.provider.callCount, providerCalls);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });

  test("phase10g approval validates but does not mutate a bound target Wallet", async () => {
    const fixture = await createDecisionFixture({ createTargetWallet: true });
    const noMoneyBefore = await captureNoMoneyState();
    const targetBefore = await Wallet.findById(fixture.request.targetWalletId).lean();
    await approve(fixture);
    assert.deepEqual(await Wallet.findById(fixture.request.targetWalletId).lean(),
      targetBefore);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });
};
