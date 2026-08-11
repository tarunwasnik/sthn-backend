import assert from "node:assert/strict";
import { test } from "node:test";

import { fxRateSnapshotService } from
  "../../../services/financial/fxRateSnapshot.service";
import {
  createFxFixture,
  startFxServer,
  systemActor,
  token,
} from "./fixtures/fxRateSnapshotFixtures";

export const registerRouteTests = () => {
  test("phase10e routes enforce Admin refresh authorization and reject supplied authority fields", async () => {
    const fixture = await createFxFixture();
    const originalRefresh = fxRateSnapshotService.refresh;
    (fxRateSnapshotService as any).refresh =
      fixture.service.refresh.bind(fixture.service);
    const server = await startFxServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/fx-rates/refresh`;
    const body = { baseCurrency: "INR", quoteCurrency: "USD", force: true };
    try {
      const unauthenticated = await fetch(url, { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body) });
      assert.equal(unauthenticated.status, 401);
      for (const id of [fixture.actors.userId, fixture.actors.creatorId]) {
        const response = await fetch(url, { method: "POST", headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token(id)}`,
        }, body: JSON.stringify(body) });
        assert.equal(response.status, 403);
      }
      const adminHeaders = { "content-type": "application/json",
        authorization: `Bearer ${token(fixture.actors.adminId)}` };
      for (const forbidden of [
        { ...body, rate: "0.5" },
        { ...body, actorId: fixture.actors.userId.toString() },
        { ...body, effectiveDate: "2026-08-02" },
      ]) {
        const response = await fetch(url, { method: "POST",
          headers: adminHeaders, body: JSON.stringify(forbidden) });
        assert.equal(response.status, 400);
      }
      const accepted = await fetch(url, { method: "POST",
        headers: adminHeaders, body: JSON.stringify(body) });
      const acceptedBody = await accepted.json() as any;
      assert.equal(accepted.status, 200, JSON.stringify(acceptedBody));
      assert.equal(acceptedBody.data.baseCurrency, "INR");
      assert.equal(acceptedBody.data.quoteCurrency, "USD");
    } finally {
      (fxRateSnapshotService as any).refresh = originalRefresh;
      await server.close();
    }
  });

  test("phase10e read route is authenticated, read-only, and excludes internal identities", async () => {
    const fixture = await createFxFixture();
    await fixture.service.lookupOrRefresh("INR", "USD", systemActor);
    const originalCurrent = fxRateSnapshotService.getCurrent;
    (fxRateSnapshotService as any).getCurrent =
      fixture.service.getCurrent.bind(fixture.service);
    const server = await startFxServer();
    const url = `${server.baseUrl}/api/v1/wallet/fx-rates/INR/USD`;
    try {
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: {
        authorization: `Bearer ${token(fixture.actors.userId)}`,
      } });
      const body = await response.json() as any;
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual({
        baseCurrency: body.data.baseCurrency,
        quoteCurrency: body.data.quoteCurrency,
        rate: body.data.rate,
        inverseRate: body.data.inverseRate,
      }, { baseCurrency: "INR", quoteCurrency: "USD",
        rate: "0.0115", inverseRate: "86.95652173913" });
      assert.ok(!Object.keys(body.data).some((key) =>
        /(^|_)id$|key|fingerprint|api|url|actor/i.test(key)));
      assert.equal(fixture.provider.callCount, 1,
        "Read-only route must not call the provider.");
    } finally {
      (fxRateSnapshotService as any).getCurrent = originalCurrent;
      await server.close();
    }
  });
};
