import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { walletConversionOperationalInspectionService } from
  "../../../services/financial/walletConversionOperationalInspection.service";
import { createHealthyOperationalFixture } from
  "./fixtures/walletConversionOperationalFixtures";
import { authToken, startDecisionServer } from
  "../phase10g/fixtures/walletConversionDecisionFixtures";

export const registerRegressionTests = () => {
  test("phase10j missing request is bounded", async () => {
    await assert.rejects(() =>
      walletConversionOperationalInspectionService.inspect(
        "WCV-00000000000000000000"),
    (error: any) => error.code ===
      "WALLET_CONVERSION_OPERATIONAL_REQUEST_NOT_FOUND");
  });

  test("phase10j classifies an invalid snapshot", async () => {
    const fixture = await createHealthyOperationalFixture();
    await ExchangeRateSnapshot.collection.updateOne({
      snapshotReference: fixture.request.fxSnapshotReference,
    }, { $set: { status: "INVALIDATED" } });
    const result = await walletConversionOperationalInspectionService.inspect(
      fixture.conversionReference);
    assert.equal(result.classification, "CORRUPTED_SNAPSHOT");
  });

  test("phase10j classifies corrupted Ledger without repairing it", async () => {
    const fixture = await createHealthyOperationalFixture();
    const entry = await LedgerEntry.findOne({
      "metadata.conversionReference": fixture.conversionReference,
    }).orFail();
    await LedgerEntry.collection.updateOne({ _id: entry._id },
      { $inc: { amount: 1 } });
    const result = await walletConversionOperationalInspectionService.inspect(
      fixture.conversionReference);
    assert.equal(result.classification, "CORRUPTED_LEDGER");
  });

  test("phase10j classifies corrupted projection without repairing it", async () => {
    const fixture = await createHealthyOperationalFixture();
    const projection = await WalletProjectionOperation.findOne({
      userId: fixture.request.userId,
    }).orFail();
    await WalletProjectionOperation.collection.updateOne({ _id: projection._id },
      { $inc: { "deltas.availableBalance": 1 } });
    const result = await walletConversionOperationalInspectionService.inspect(
      fixture.conversionReference);
    assert.equal(result.classification, "CORRUPTED_PROJECTION");
  });

  test("phase10j classifies corrupted Provider authority", async () => {
    const fixture = await createHealthyOperationalFixture();
    await InternalWalletConversionProviderRequest.collection.updateOne({
      conversionReference: fixture.conversionReference,
    }, { $set: { responseCode: "CORRUPTED" } });
    const result = await walletConversionOperationalInspectionService.inspect(
      fixture.conversionReference);
    assert.equal(result.classification, "CORRUPTED_PROVIDER");
  });

  test("phase10j Admin route enforces authorization and safe DTO", async () => {
    const fixture = await createHealthyOperationalFixture();
    const server = await startDecisionServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/` +
      `wallet-conversion-requests/${fixture.conversionReference}/reconciliation`;
    try {
      const send = (token?: string) => fetch(url, { headers: token
        ? { authorization: `Bearer ${token}` } : {} });
      assert.equal((await send()).status, 401);
      assert.equal((await send(authToken(fixture.actors.userId))).status, 403);
      assert.equal((await send(authToken(fixture.actors.creatorId))).status, 403);
      const accepted = await send(authToken(fixture.actors.adminId));
      const body = await accepted.json() as any;
      assert.equal(accepted.status, 200);
      assert.deepEqual(Object.keys(body.data).sort(), ["allowedActions",
        "classification", "conversionReference", "issues",
        "reconciliationReference", "repairPerformed", "retryPerformed",
        "severity"].sort());
      assert.match(body.data.reconciliationReference, /^WCR-[A-F0-9]{20}$/);
      assert.deepEqual(body.data.allowedActions, []);
    } finally { await server.close(); }
  });
};
