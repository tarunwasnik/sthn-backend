import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { account, captureUnrelatedFinancialState,
  createAccountingFixture } from
  "./fixtures/walletConversionAccountingFixtures";
import { authToken, startDecisionServer } from
  "../phase10h/fixtures/walletConversionProviderFixtures";

export const registerRegressionTests = () => {
  test("phase10i accounting does not mutate unrelated financial domains or FX", async () => {
    const fixture = await createAccountingFixture();
    const before = await captureUnrelatedFinancialState();
    await account(fixture);
    assert.deepEqual(await captureUnrelatedFinancialState(), before);
    const snapshot = await ExchangeRateSnapshot.findOne({
      snapshotReference: fixture.request.fxSnapshotReference,
    }).orFail();
    assert.equal(snapshot.snapshotReference, fixture.request.fxSnapshotReference);
    assert.equal(fixture.executions, 1);
  });

  test("phase10i Admin accounting route is protected, bodyless, and safe", async () => {
    const fixture = await createAccountingFixture();
    const server = await startDecisionServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/` +
      `wallet-conversion-requests/${fixture.created.conversionReference}/` +
      "complete-accounting";
    const send = (token?: string, body?: object) => fetch(url, {
      method: "POST",
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      assert.equal((await send()).status, 401);
      assert.equal((await send(authToken(fixture.actors.userId))).status, 403);
      assert.equal((await send(authToken(fixture.actors.adminId),
        { sourceAmount: 1 })).status, 400);
      const accepted = await send(authToken(fixture.actors.adminId));
      assert.equal(accepted.status, 200);
      const response = await accepted.json() as any;
      assert.deepEqual(Object.keys(response.data).sort(), ["completedAt",
        "conversionReference", "sourceAmount", "sourceCurrency", "status",
        "targetAmount", "targetCurrency"].sort());
    } finally { await server.close(); }
  });
};
