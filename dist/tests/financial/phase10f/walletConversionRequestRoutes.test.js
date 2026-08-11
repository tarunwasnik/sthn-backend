"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRouteTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionRequest_service_1 = require("../../../services/financial/walletConversionRequest.service");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerRouteTests = () => {
    (0, node_test_1.test)("phase10f routes enforce authentication, strict authority input, and Creator reuse", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await (0, walletConversionRequestFixtures_1.fundWallet)(fixture.actors.creatorId, "INR", 1000000);
        const originals = {
            create: walletConversionRequest_service_1.walletConversionRequestService.create,
            listOwn: walletConversionRequest_service_1.walletConversionRequestService.listOwn,
            getOwn: walletConversionRequest_service_1.walletConversionRequestService.getOwn,
        };
        walletConversionRequest_service_1.walletConversionRequestService.create =
            fixture.service.create.bind(fixture.service);
        walletConversionRequest_service_1.walletConversionRequestService.listOwn =
            fixture.service.listOwn.bind(fixture.service);
        walletConversionRequest_service_1.walletConversionRequestService.getOwn =
            fixture.service.getOwn.bind(fixture.service);
        const server = await (0, walletConversionRequestFixtures_1.startConversionServer)();
        const url = `${server.baseUrl}/api/v1/wallet/conversion-requests`;
        const body = { sourceCurrency: "INR", targetCurrency: "USD",
            sourceAmount: 870000 };
        try {
            strict_1.default.equal((await fetch(url, { method: "POST", headers: {
                    "content-type": "application/json", "Idempotency-Key": "unauthenticated",
                }, body: JSON.stringify(body) })).status, 401);
            const userHeaders = { "content-type": "application/json",
                "Idempotency-Key": "phase10f-route-user",
                authorization: `Bearer ${(0, walletConversionRequestFixtures_1.authToken)(fixture.actors.userId)}` };
            for (const forbidden of ["userId", "sourceWalletId", "snapshotReference",
                "rate", "targetAmount", "status", "actorId"]) {
                const response = await fetch(url, { method: "POST", headers: userHeaders,
                    body: JSON.stringify({ ...body, [forbidden]: "forbidden" }) });
                strict_1.default.equal(response.status, 400);
            }
            const accepted = await fetch(url, { method: "POST", headers: userHeaders,
                body: JSON.stringify(body) });
            strict_1.default.equal(accepted.status, 201);
            const creator = await fetch(url, { method: "POST", headers: {
                    ...userHeaders, "Idempotency-Key": "phase10f-route-creator",
                    authorization: `Bearer ${(0, walletConversionRequestFixtures_1.authToken)(fixture.actors.creatorId)}`,
                }, body: JSON.stringify(body) });
            strict_1.default.equal(creator.status, 201, await creator.text());
        }
        finally {
            Object.assign(walletConversionRequest_service_1.walletConversionRequestService, originals);
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10f list/get are ownership-scoped and safe", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const created = await fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-route-safe"));
        const originals = { listOwn: walletConversionRequest_service_1.walletConversionRequestService.listOwn,
            getOwn: walletConversionRequest_service_1.walletConversionRequestService.getOwn };
        walletConversionRequest_service_1.walletConversionRequestService.listOwn =
            fixture.service.listOwn.bind(fixture.service);
        walletConversionRequest_service_1.walletConversionRequestService.getOwn =
            fixture.service.getOwn.bind(fixture.service);
        const server = await (0, walletConversionRequestFixtures_1.startConversionServer)();
        const base = `${server.baseUrl}/api/v1/wallet/conversion-requests`;
        try {
            const headers = { authorization: `Bearer ${(0, walletConversionRequestFixtures_1.authToken)(fixture.actors.userId)}` };
            const list = await fetch(base, { headers });
            const listBody = await list.json();
            strict_1.default.equal(list.status, 200);
            strict_1.default.equal(listBody.data.length, 1);
            const get = await fetch(`${base}/${created.conversionReference}`, { headers });
            const getBody = await get.json();
            strict_1.default.equal(get.status, 200);
            strict_1.default.ok(!Object.keys(getBody.data).some((key) => /(^|_)id$|key|fingerprint|secret|url|actor|admin/i.test(key)));
            const other = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
            const forbidden = await fixture.service.getOwn(other.actors.userId.toString(), created.conversionReference).then(() => null, (error) => error);
            strict_1.default.equal(forbidden?.code, "WALLET_CONVERSION_REQUEST_NOT_FOUND");
        }
        finally {
            Object.assign(walletConversionRequest_service_1.walletConversionRequestService, originals);
            await server.close();
        }
    });
};
exports.registerRouteTests = registerRouteTests;
