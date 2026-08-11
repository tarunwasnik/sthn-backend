"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRouteTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerRouteTests = () => {
    (0, node_test_1.test)("phase10e routes enforce Admin refresh authorization and reject supplied authority fields", async () => {
        const fixture = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const originalRefresh = fxRateSnapshot_service_1.fxRateSnapshotService.refresh;
        fxRateSnapshot_service_1.fxRateSnapshotService.refresh =
            fixture.service.refresh.bind(fixture.service);
        const server = await (0, fxRateSnapshotFixtures_1.startFxServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/fx-rates/refresh`;
        const body = { baseCurrency: "INR", quoteCurrency: "USD", force: true };
        try {
            const unauthenticated = await fetch(url, { method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body) });
            strict_1.default.equal(unauthenticated.status, 401);
            for (const id of [fixture.actors.userId, fixture.actors.creatorId]) {
                const response = await fetch(url, { method: "POST", headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${(0, fxRateSnapshotFixtures_1.token)(id)}`,
                    }, body: JSON.stringify(body) });
                strict_1.default.equal(response.status, 403);
            }
            const adminHeaders = { "content-type": "application/json",
                authorization: `Bearer ${(0, fxRateSnapshotFixtures_1.token)(fixture.actors.adminId)}` };
            for (const forbidden of [
                { ...body, rate: "0.5" },
                { ...body, actorId: fixture.actors.userId.toString() },
                { ...body, effectiveDate: "2026-08-02" },
            ]) {
                const response = await fetch(url, { method: "POST",
                    headers: adminHeaders, body: JSON.stringify(forbidden) });
                strict_1.default.equal(response.status, 400);
            }
            const accepted = await fetch(url, { method: "POST",
                headers: adminHeaders, body: JSON.stringify(body) });
            const acceptedBody = await accepted.json();
            strict_1.default.equal(accepted.status, 200, JSON.stringify(acceptedBody));
            strict_1.default.equal(acceptedBody.data.baseCurrency, "INR");
            strict_1.default.equal(acceptedBody.data.quoteCurrency, "USD");
        }
        finally {
            fxRateSnapshot_service_1.fxRateSnapshotService.refresh = originalRefresh;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10e read route is authenticated, read-only, and excludes internal identities", async () => {
        const fixture = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        await fixture.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        const originalCurrent = fxRateSnapshot_service_1.fxRateSnapshotService.getCurrent;
        fxRateSnapshot_service_1.fxRateSnapshotService.getCurrent =
            fixture.service.getCurrent.bind(fixture.service);
        const server = await (0, fxRateSnapshotFixtures_1.startFxServer)();
        const url = `${server.baseUrl}/api/v1/wallet/fx-rates/INR/USD`;
        try {
            strict_1.default.equal((await fetch(url)).status, 401);
            const response = await fetch(url, { headers: {
                    authorization: `Bearer ${(0, fxRateSnapshotFixtures_1.token)(fixture.actors.userId)}`,
                } });
            const body = await response.json();
            strict_1.default.equal(response.status, 200, JSON.stringify(body));
            strict_1.default.deepEqual({
                baseCurrency: body.data.baseCurrency,
                quoteCurrency: body.data.quoteCurrency,
                rate: body.data.rate,
                inverseRate: body.data.inverseRate,
            }, { baseCurrency: "INR", quoteCurrency: "USD",
                rate: "0.0115", inverseRate: "86.95652173913" });
            strict_1.default.ok(!Object.keys(body.data).some((key) => /(^|_)id$|key|fingerprint|api|url|actor/i.test(key)));
            strict_1.default.equal(fixture.provider.callCount, 1, "Read-only route must not call the provider.");
        }
        finally {
            fxRateSnapshot_service_1.fxRateSnapshotService.getCurrent = originalCurrent;
            await server.close();
        }
    });
};
exports.registerRouteTests = registerRouteTests;
