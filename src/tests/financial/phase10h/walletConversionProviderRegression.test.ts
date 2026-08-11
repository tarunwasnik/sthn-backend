import assert from "node:assert/strict";
import { test } from "node:test";

import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { captureFrozenFinancialState, createProviderFixture, executeSuccess } from
  "./fixtures/walletConversionProviderFixtures";

export const registerRegressionTests = () => {
  test("phase10h no-money-movement preserves every frozen financial authority", async () => {
    const fixture = await createProviderFixture();
    const frozen = await captureFrozenFinancialState();
    await executeSuccess(fixture);
    assert.deepEqual(await captureFrozenFinancialState(), frozen);
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).orFail();
    assert.equal(request.status, "APPROVED");
    const approvalReplay = await fixture.decisionService.decide({
      adminUserId: fixture.actors.adminId.toString(),
      conversionReference: fixture.created.conversionReference,
      decision: "APPROVE",
    });
    assert.equal(approvalReplay.status, "APPROVED");
  });

  test("phase10h indexes preserve deterministic provider and audit authority", async () => {
    const providerIndexes = await
      InternalWalletConversionProviderRequest.collection.indexes();
    const requestIndexes = await WalletConversionRequest.collection.indexes();
    const auditIndexes = await WalletConversionAudit.collection.indexes();
    for (const field of ["providerRequestReference", "providerRequestKey",
      "conversionReference", "providerExecutionReference"]) {
      assert.ok(providerIndexes.some((index) => index.unique &&
        index.key[field] === 1), `missing unique ${field}`);
    }
    assert.ok(providerIndexes.some((index) => index.key.providerStatus === 1 &&
      index.key.createdAt === 1));
    assert.ok(requestIndexes.some((index) =>
      index.key.providerRequestReference === 1));
    assert.ok(auditIndexes.some((index) => index.key.action === 1 &&
      index.key.completedAt === -1));
  });
};
