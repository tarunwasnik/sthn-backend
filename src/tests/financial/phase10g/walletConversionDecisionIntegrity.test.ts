import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { approve, createDecisionFixture, reject } from
  "./fixtures/walletConversionDecisionFixtures";
import { FIXED_NOW } from "../phase10e/fixtures/fxRateSnapshotFixtures";

const code = (expected: string) => (error: any) => error.code === expected;

export const registerIntegrityTests = () => {
  test("phase10g fails closed for a missing conversion request", async () => {
    const fixture = await createDecisionFixture();
    await assert.rejects(() => fixture.decisionService.decide({
      adminUserId: fixture.actors.adminId.toString(),
      conversionReference: "WCV-20260803-FFFFFFFF",
      decision: "APPROVE",
    }), code("WALLET_CONVERSION_REQUEST_NOT_FOUND"));
  });

  test("phase10g rejects expired approval without refresh but permits rejection", async () => {
    const expiredNow = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000 + 1);
    const fixture = await createDecisionFixture({ decisionNow: expiredNow });
    const providerCalls = fixture.provider.callCount;
    await assert.rejects(() => approve(fixture),
      code("WALLET_CONVERSION_SNAPSHOT_EXPIRED"));
    assert.equal((await WalletConversionRequest.findOne({}))?.status, "PENDING");
    const rejected = await reject(fixture, "FX_SNAPSHOT_NOT_ACCEPTABLE",
      "Bound snapshot expired");
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.fxSnapshotReference,
      fixture.request.fxSnapshotReference);
    assert.equal(fixture.provider.callCount, providerCalls);
  });

  test("phase10g approval balance precheck is read-only and rejection remains possible", async () => {
    const fixture = await createDecisionFixture();
    await Wallet.collection.updateOne({ _id: fixture.request.sourceWalletId },
      { $set: { currentBalance: 1, availableBalance: 1 } });
    const walletBefore = await Wallet.findById(fixture.request.sourceWalletId).lean();
    await assert.rejects(() => approve(fixture),
      code("WALLET_CONVERSION_INSUFFICIENT_AVAILABLE_BALANCE"));
    assert.equal((await WalletConversionRequest.findOne({}))?.status, "PENDING");
    await reject(fixture, "INSUFFICIENT_SOURCE_FUNDS");
    assert.deepEqual(await Wallet.findById(fixture.request.sourceWalletId).lean(),
      walletBefore);
  });

  for (const [label, update] of [
    ["fingerprint", { requestFingerprint: "corrupted" }],
    ["provider", { fxProvider: "corrupted-provider" }],
    ["rate", { rateValue: "999999" }],
    ["currency pair", { targetCurrency: "EUR" }],
    ["target amount", { targetAmount: 1 }],
  ] as const) {
    test(`phase10g rejects corrupted request ${label}`, async () => {
      const fixture = await createDecisionFixture();
      await WalletConversionRequest.collection.updateOne(
        { _id: fixture.request._id }, { $set: update });
      await assert.rejects(() => approve(fixture),
        (error: any) => /INTEGRITY|SNAPSHOT/.test(error.code));
      assert.equal((await WalletConversionRequest.findById(
        fixture.request._id))?.status, "PENDING");
    });
  }

  test("phase10g rejects a missing or mismatched bound snapshot", async () => {
    const missing = await createDecisionFixture();
    await ExchangeRateSnapshot.deleteOne({
      snapshotReference: missing.request.fxSnapshotReference,
    });
    await assert.rejects(() => approve(missing),
      code("WALLET_CONVERSION_SNAPSHOT_NOT_FOUND"));

    const mismatch = await createDecisionFixture();
    const other = await ExchangeRateSnapshot.findOne({
      baseCurrency: "INR", quoteCurrency: "EUR",
    });
    assert.ok(other);
    await WalletConversionRequest.collection.updateOne({ _id: mismatch.request._id },
      { $set: { fxSnapshotReference: other.snapshotReference } });
    await assert.rejects(() => approve(mismatch),
      (error: any) => /SNAPSHOT|INTEGRITY/.test(error.code));
  });

  test("phase10g rejects missing, foreign, or wrong-currency source Wallet authority", async () => {
    const missing = await createDecisionFixture();
    await Wallet.deleteOne({ _id: missing.request.sourceWalletId });
    await assert.rejects(() => approve(missing),
      code("WALLET_CONVERSION_SOURCE_WALLET_NOT_FOUND"));

    const foreign = await createDecisionFixture();
    await Wallet.collection.updateOne({ _id: foreign.request.sourceWalletId },
      { $set: { userId: foreign.actors.creatorId } });
    await assert.rejects(() => approve(foreign),
      code("WALLET_CONVERSION_SOURCE_WALLET_CONFLICT"));

    const currency = await createDecisionFixture();
    await Wallet.collection.updateOne({ _id: currency.request.sourceWalletId },
      { $set: { currency: "USD" } });
    await assert.rejects(() => approve(currency),
      code("WALLET_CONVERSION_SOURCE_WALLET_CONFLICT"));
  });

  test("phase10g rejects foreign or wrong-currency bound target Wallet authority", async () => {
    const foreign = await createDecisionFixture({ createTargetWallet: true });
    await Wallet.collection.updateOne({ _id: foreign.request.targetWalletId },
      { $set: { userId: foreign.actors.creatorId } });
    await assert.rejects(() => approve(foreign),
      code("WALLET_CONVERSION_TARGET_WALLET_CONFLICT"));

    const currency = await createDecisionFixture({ createTargetWallet: true });
    await Wallet.collection.updateOne({ _id: currency.request.targetWalletId },
      { $set: { currency: "EUR" } });
    await assert.rejects(() => approve(currency),
      code("WALLET_CONVERSION_TARGET_WALLET_CONFLICT"));
  });

  test("phase10g rejects partial and internally conflicting terminal metadata", async () => {
    const partialApproval = await createDecisionFixture();
    await WalletConversionRequest.collection.updateOne(
      { _id: partialApproval.request._id }, { $set: { status: "APPROVED" } });
    await assert.rejects(() => approve(partialApproval),
      code("WALLET_CONVERSION_INTEGRITY_ERROR"));

    const partialRejection = await createDecisionFixture();
    await WalletConversionRequest.collection.updateOne(
      { _id: partialRejection.request._id }, { $set: { status: "REJECTED",
        decidedAt: new Date(), decidedBy: partialRejection.actors.adminId } });
    await assert.rejects(() => reject(partialRejection),
      code("WALLET_CONVERSION_INTEGRITY_ERROR"));

    const hybrid = await createDecisionFixture();
    await approve(hybrid);
    await WalletConversionRequest.collection.updateOne({ _id: hybrid.request._id },
      { $set: { rejectionCode: "OTHER", rejectionReason: "corrupted" } });
    await assert.rejects(() => approve(hybrid),
      code("WALLET_CONVERSION_INTEGRITY_ERROR"));
  });

  test("phase10g replay detects actor and timestamp authority corruption", async () => {
    const actor = await createDecisionFixture();
    await approve(actor);
    await WalletConversionRequest.collection.updateOne({ _id: actor.request._id },
      { $set: { decidedBy: new Types.ObjectId() } });
    await assert.rejects(() => approve(actor),
      code("WALLET_CONVERSION_INTEGRITY_ERROR"));

    const timestamp = await createDecisionFixture();
    await approve(timestamp);
    await WalletConversionRequest.collection.updateOne({ _id: timestamp.request._id },
      { $set: { decidedAt: new Date("2026-08-02T13:01:00.000Z") } });
    await assert.rejects(() => approve(timestamp),
      code("WALLET_CONVERSION_INTEGRITY_ERROR"));
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_APPROVED",
    }), 2);
  });
};
