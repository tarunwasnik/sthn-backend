import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { approve, captureNoMoneyState, createDecisionFixture, reject } from
  "./fixtures/walletConversionDecisionFixtures";

export const registerConcurrencyTests = () => {
  test("phase10g concurrency: ten approvals converge on one authority", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      approve(fixture)));
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
    const values = settled.filter((item): item is PromiseFulfilledResult<any> =>
      item.status === "fulfilled").map((item) => item.value);
    assert.equal(new Set(values.map((item) => item.decidedAt.toISOString())).size, 1);
    assert.equal((await WalletConversionRequest.findOne({}))?.status, "APPROVED");
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_APPROVED" }), 1);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });

  test("phase10g concurrency: ten identical rejections converge", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      reject(fixture, "ADMIN_DECLINED", "Same reason")));
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
    assert.equal((await WalletConversionRequest.findOne({}))?.status, "REJECTED");
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_REJECTED" }), 1);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });

  test("phase10g concurrency: approval versus rejection race has one winner", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const settled = await Promise.allSettled([approve(fixture), reject(fixture)]);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
    const request = await WalletConversionRequest.findOne({});
    assert.ok(["APPROVED", "REJECTED"].includes(request!.status));
    assert.equal(Boolean(request?.rejectionCode), request?.status === "REJECTED");
    assert.equal(await WalletConversionAudit.countDocuments({ action: {
      $in: ["WALLET_CONVERSION_APPROVED", "WALLET_CONVERSION_REJECTED"],
    } }), 1);
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });

  test("phase10g concurrency: different rejection race preserves one payload", async () => {
    const fixture = await createDecisionFixture();
    const noMoneyBefore = await captureNoMoneyState();
    const settled = await Promise.allSettled([
      reject(fixture, "ADMIN_DECLINED", "First"),
      reject(fixture, "OTHER", "Second"),
    ]);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
    const request = await WalletConversionRequest.findOne({});
    assert.ok([["ADMIN_DECLINED", "First"], ["OTHER", "Second"]]
      .some(([code, reason]) => request?.rejectionCode === code &&
        request?.rejectionReason === reason));
    assert.deepEqual(await captureNoMoneyState(), noMoneyBefore);
  });
};
