import assert from "node:assert/strict";
import { test } from "node:test";

import { adminWalletConversionDecisionService } from
  "../../../services/financial/adminWalletConversionDecision.service";
import { walletConversionRequestService } from
  "../../../services/financial/walletConversionRequest.service";
import { authToken, createDecisionFixture, startDecisionServer } from
  "./fixtures/walletConversionDecisionFixtures";

const unsafe = (value: Record<string, unknown>) => Object.keys(value).some(
  (key) => /(^|_)id$|walletId|key|fingerprint|secret|actor|admin/i.test(key));

export const registerRouteTests = () => {
  test("phase10g Admin decision route enforces authentication, role, and strict body", async () => {
    const fixture = await createDecisionFixture();
    const originals = { decide: adminWalletConversionDecisionService.decide,
      list: adminWalletConversionDecisionService.list,
      get: adminWalletConversionDecisionService.get };
    (adminWalletConversionDecisionService as any).decide =
      fixture.decisionService.decide.bind(fixture.decisionService);
    (adminWalletConversionDecisionService as any).list =
      fixture.decisionService.list.bind(fixture.decisionService);
    (adminWalletConversionDecisionService as any).get =
      fixture.decisionService.get.bind(fixture.decisionService);
    const server = await startDecisionServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/` +
      `wallet-conversion-requests/${fixture.created.conversionReference}/decision`;
    try {
      const send = (token: string | undefined, body: object) => fetch(url, {
        method: "PATCH", headers: { "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      assert.equal((await send(undefined, { decision: "APPROVE" })).status, 401);
      assert.equal((await send(authToken(fixture.actors.userId),
        { decision: "APPROVE" })).status, 403);
      assert.equal((await send(authToken(fixture.actors.creatorId),
        { decision: "APPROVE" })).status, 403);
      for (const field of ["adminId", "decidedBy", "decidedAt", "status",
        "sourceAmount", "targetAmount", "rate", "fxSnapshotReference",
        "sourceWalletId", "userId"]) {
        assert.equal((await send(authToken(fixture.actors.adminId),
          { decision: "APPROVE", [field]: "forbidden" })).status, 400);
      }
      const accepted = await send(authToken(fixture.actors.adminId),
        { decision: "APPROVE" });
      assert.equal(accepted.status, 200, await accepted.text());
    } finally {
      Object.assign(adminWalletConversionDecisionService, originals);
      await server.close();
    }
  });

  test("phase10g Admin list/detail are safe, filtered, ordered, and paginated", async () => {
    const fixture = await createDecisionFixture();
    const second = await fixture.requestService.create(
      fixture.actors.userId.toString(), { sourceCurrency: "INR",
        targetCurrency: "EUR", sourceAmount: 500_000,
        idempotencyKey: "phase10g-admin-second" });
    const originals = { decide: adminWalletConversionDecisionService.decide,
      list: adminWalletConversionDecisionService.list,
      get: adminWalletConversionDecisionService.get };
    (adminWalletConversionDecisionService as any).decide =
      fixture.decisionService.decide.bind(fixture.decisionService);
    (adminWalletConversionDecisionService as any).list =
      fixture.decisionService.list.bind(fixture.decisionService);
    (adminWalletConversionDecisionService as any).get =
      fixture.decisionService.get.bind(fixture.decisionService);
    const server = await startDecisionServer();
    const base = `${server.baseUrl}/api/v1/admin/financial/wallet-conversion-requests`;
    const headers = { authorization: `Bearer ${authToken(fixture.actors.adminId)}` };
    try {
      const listResponse = await fetch(`${base}?status=PENDING&sourceCurrency=INR&limit=1`,
        { headers });
      const list = await listResponse.json() as any;
      assert.equal(listResponse.status, 200);
      assert.equal(list.data.length, 1);
      assert.equal(list.data[0].conversionReference,
        fixture.created.conversionReference);
      assert.equal(unsafe(list.data[0]), false);
      const filteredResponse = await fetch(`${base}?targetCurrency=EUR`, { headers });
      const filtered = await filteredResponse.json() as any;
      assert.deepEqual(filtered.data.map((item: any) => item.conversionReference),
        [second.conversionReference]);
      const detailResponse = await fetch(
        `${base}/${fixture.created.conversionReference}`, { headers });
      const detail = await detailResponse.json() as any;
      assert.equal(detailResponse.status, 200);
      assert.equal(unsafe(detail.data), false);
      assert.equal((await fetch(`${base}?limit=101`, { headers })).status, 200);
      assert.equal((await fetch(`${base}?page=0`, { headers })).status, 422);
    } finally {
      Object.assign(adminWalletConversionDecisionService, originals);
      await server.close();
    }
  });

  test("phase10g User ownership remains scoped and exposes safe decision state", async () => {
    const fixture = await createDecisionFixture();
    await fixture.decisionService.decide({
      adminUserId: fixture.actors.adminId.toString(),
      conversionReference: fixture.created.conversionReference,
      decision: "REJECT", rejectionCode: "ADMIN_DECLINED",
      rejectionReason: "Bounded user-visible reason",
    });
    const originals = { listOwn: walletConversionRequestService.listOwn,
      getOwn: walletConversionRequestService.getOwn };
    (walletConversionRequestService as any).listOwn =
      fixture.requestService.listOwn.bind(fixture.requestService);
    (walletConversionRequestService as any).getOwn =
      fixture.requestService.getOwn.bind(fixture.requestService);
    const server = await startDecisionServer();
    const url = `${server.baseUrl}/api/v1/wallet/conversion-requests/` +
      fixture.created.conversionReference;
    try {
      const own = await fetch(url, { headers: { authorization:
        `Bearer ${authToken(fixture.actors.userId)}` } });
      const body = await own.json() as any;
      assert.equal(own.status, 200);
      assert.equal(body.data.status, "REJECTED");
      assert.equal(body.data.rejectionCode, "ADMIN_DECLINED");
      assert.equal(unsafe(body.data), false);
      const other = await fetch(url, { headers: { authorization:
        `Bearer ${authToken(fixture.actors.creatorId)}` } });
      assert.equal(other.status, 404);
    } finally {
      Object.assign(walletConversionRequestService, originals);
      await server.close();
    }
  });
};
