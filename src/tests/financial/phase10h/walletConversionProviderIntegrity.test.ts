import assert from "node:assert/strict";
import { test } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { walletConversionProviderExecutionService } from
  "../../../services/financial/walletConversionProviderExecution.service";
import { createDecisionFixture, reject } from
  "../phase10g/fixtures/walletConversionDecisionFixtures";
import { authToken, createProviderFixture, executeSuccess,
  startDecisionServer } from "./fixtures/walletConversionProviderFixtures";

const code = (expected: string) => (error: any) => error.code === expected;

export const registerIntegrityTests = () => {
  test("phase10h integrity permits only APPROVED conversion requests", async () => {
    const pending = await createDecisionFixture();
    await assert.rejects(() => walletConversionProviderExecutionService.execute({
      adminUserId: pending.actors.adminId.toString(),
      conversionReference: pending.created.conversionReference,
      outcome: "SUCCESS",
    }), code("WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED"));
    const rejected = await createDecisionFixture();
    await reject(rejected);
    await assert.rejects(() => walletConversionProviderExecutionService.execute({
      adminUserId: rejected.actors.adminId.toString(),
      conversionReference: rejected.created.conversionReference,
      outcome: "SUCCESS",
    }), code("WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED"));
    assert.equal(await InternalWalletConversionProviderRequest.countDocuments({}), 0);
  });

  test("phase10h integrity rejects corrupted request and snapshot authority", async () => {
    const request = await createProviderFixture();
    await WalletConversionRequest.collection.updateOne({
      conversionReference: request.created.conversionReference,
    }, { $set: { requestFingerprint: "corrupted" } });
    await assert.rejects(() => executeSuccess(request),
      code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));

    const snapshot = await createProviderFixture();
    await ExchangeRateSnapshot.collection.updateOne({
      snapshotReference: snapshot.request.fxSnapshotReference,
    }, { $set: { status: "INVALIDATED" } });
    await assert.rejects(() => executeSuccess(snapshot),
      code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));
  });

  test("phase10h integrity rejects corrupted provider identity, events, and synchronization", async () => {
    const identity = await createProviderFixture({
      failureInjector: (stage) => {
        if (stage === "AFTER_AUTHORITY") throw new Error("stop");
      },
    });
    await assert.rejects(() => executeSuccess(identity));
    await InternalWalletConversionProviderRequest.collection.updateOne({
      conversionReference: identity.created.conversionReference,
    }, { $set: { providerFingerprint: "0".repeat(64) } });
    const cleanService = new (identity.service.constructor as any)(
      identity.requestService);
    await assert.rejects(() => cleanService.execute({
      adminUserId: identity.actors.adminId.toString(),
      conversionReference: identity.created.conversionReference,
      outcome: "SUCCESS",
    }), code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));

    const events = await createProviderFixture();
    await executeSuccess(events);
    await InternalProviderEvent.deleteOne({
      entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
      eventType: "CONVERSION_PROVIDER_PROCESSING",
    });
    await assert.rejects(() => events.service.validateReplay(
      events.created.conversionReference),
    code("WALLET_CONVERSION_PROVIDER_EVENT_CONFLICT"));

    const sync = await createProviderFixture();
    await executeSuccess(sync);
    await WalletConversionRequest.collection.updateOne({
      conversionReference: sync.created.conversionReference,
    }, { $set: { providerStatus: "FAILED" } });
    await assert.rejects(() => sync.service.validateReplay(
      sync.created.conversionReference),
    code("WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT"));
  });

  test("phase10h Admin route enforces authorization and strict execution input", async () => {
    const fixture = await createProviderFixture();
    const original = walletConversionProviderExecutionService.execute;
    (walletConversionProviderExecutionService as any).execute =
      fixture.service.execute.bind(fixture.service);
    const server = await startDecisionServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/` +
      `wallet-conversion-requests/${fixture.created.conversionReference}/` +
      "execute-provider";
    const send = (token: string | undefined, body: object) => fetch(url, {
      method: "POST", headers: { "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    try {
      assert.equal((await send(undefined, { outcome: "SUCCESS" })).status, 401);
      assert.equal((await send(authToken(fixture.actors.userId),
        { outcome: "SUCCESS" })).status, 403);
      assert.equal((await send(authToken(fixture.actors.creatorId),
        { outcome: "SUCCESS" })).status, 403);
      for (const field of ["adminId", "userId", "sourceAmount",
        "targetAmount", "providerReference", "snapshotReference", "status",
        "processingAt", "completedAt", "payload"]) {
        assert.equal((await send(authToken(fixture.actors.adminId),
          { outcome: "SUCCESS", [field]: "forbidden" })).status, 400);
      }
      const accepted = await send(authToken(fixture.actors.adminId),
        { outcome: "SUCCESS" });
      assert.equal(accepted.status, 200);
      const body = await accepted.json() as any;
      assert.ok(!Object.keys(body.data).some((key) =>
        /(^|_)id$|fingerprint|key|payload|secret/i.test(key)));
    } finally {
      (walletConversionProviderExecutionService as any).execute = original;
      await server.close();
    }
  });
};
