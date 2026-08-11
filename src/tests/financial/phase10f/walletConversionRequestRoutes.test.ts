import assert from "node:assert/strict";
import { test } from "node:test";

import { walletConversionRequestService } from
  "../../../services/financial/walletConversionRequest.service";
import { authToken, createConversionFixture, fundWallet, requestInput,
  startConversionServer } from "./fixtures/walletConversionRequestFixtures";

export const registerRouteTests = () => {
  test("phase10f routes enforce authentication, strict authority input, and Creator reuse", async () => {
    const fixture = await createConversionFixture();
    await fundWallet(fixture.actors.creatorId, "INR", 1_000_000);
    const originals = {
      create: walletConversionRequestService.create,
      listOwn: walletConversionRequestService.listOwn,
      getOwn: walletConversionRequestService.getOwn,
    };
    (walletConversionRequestService as any).create =
      fixture.service.create.bind(fixture.service);
    (walletConversionRequestService as any).listOwn =
      fixture.service.listOwn.bind(fixture.service);
    (walletConversionRequestService as any).getOwn =
      fixture.service.getOwn.bind(fixture.service);
    const server = await startConversionServer();
    const url = `${server.baseUrl}/api/v1/wallet/conversion-requests`;
    const body = { sourceCurrency: "INR", targetCurrency: "USD",
      sourceAmount: 870_000 };
    try {
      assert.equal((await fetch(url, { method: "POST", headers: {
        "content-type": "application/json", "Idempotency-Key": "unauthenticated",
      }, body: JSON.stringify(body) })).status, 401);
      const userHeaders = { "content-type": "application/json",
        "Idempotency-Key": "phase10f-route-user",
        authorization: `Bearer ${authToken(fixture.actors.userId)}` };
      for (const forbidden of ["userId", "sourceWalletId", "snapshotReference",
        "rate", "targetAmount", "status", "actorId"]) {
        const response = await fetch(url, { method: "POST", headers: userHeaders,
          body: JSON.stringify({ ...body, [forbidden]: "forbidden" }) });
        assert.equal(response.status, 400);
      }
      const accepted = await fetch(url, { method: "POST", headers: userHeaders,
        body: JSON.stringify(body) });
      assert.equal(accepted.status, 201);
      const creator = await fetch(url, { method: "POST", headers: {
        ...userHeaders, "Idempotency-Key": "phase10f-route-creator",
        authorization: `Bearer ${authToken(fixture.actors.creatorId)}`,
      }, body: JSON.stringify(body) });
      assert.equal(creator.status, 201, await creator.text());
    } finally {
      Object.assign(walletConversionRequestService, originals);
      await server.close();
    }
  });

  test("phase10f list/get are ownership-scoped and safe", async () => {
    const fixture = await createConversionFixture();
    const created = await fixture.service.create(fixture.actors.userId.toString(),
      requestInput("phase10f-route-safe"));
    const originals = { listOwn: walletConversionRequestService.listOwn,
      getOwn: walletConversionRequestService.getOwn };
    (walletConversionRequestService as any).listOwn =
      fixture.service.listOwn.bind(fixture.service);
    (walletConversionRequestService as any).getOwn =
      fixture.service.getOwn.bind(fixture.service);
    const server = await startConversionServer();
    const base = `${server.baseUrl}/api/v1/wallet/conversion-requests`;
    try {
      const headers = { authorization: `Bearer ${authToken(fixture.actors.userId)}` };
      const list = await fetch(base, { headers });
      const listBody = await list.json() as any;
      assert.equal(list.status, 200);
      assert.equal(listBody.data.length, 1);
      const get = await fetch(`${base}/${created.conversionReference}`, { headers });
      const getBody = await get.json() as any;
      assert.equal(get.status, 200);
      assert.ok(!Object.keys(getBody.data).some((key) =>
        /(^|_)id$|key|fingerprint|secret|url|actor|admin/i.test(key)));
      const other = await createConversionFixture();
      const forbidden = await fixture.service.getOwn(
        other.actors.userId.toString(), created.conversionReference,
      ).then(() => null, (error) => error);
      assert.equal(forbidden?.code, "WALLET_CONVERSION_REQUEST_NOT_FOUND");
    } finally {
      Object.assign(walletConversionRequestService, originals);
      await server.close();
    }
  });
};
