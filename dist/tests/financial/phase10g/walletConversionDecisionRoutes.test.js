"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRouteTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const adminWalletConversionDecision_service_1 = require("../../../services/financial/adminWalletConversionDecision.service");
const walletConversionRequest_service_1 = require("../../../services/financial/walletConversionRequest.service");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const unsafe = (value) => Object.keys(value).some((key) => /(^|_)id$|walletId|key|fingerprint|secret|actor|admin/i.test(key));
const registerRouteTests = () => {
    (0, node_test_1.test)("phase10g Admin decision route enforces authentication, role, and strict body", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const originals = { decide: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.decide,
            list: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.list,
            get: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.get };
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.decide =
            fixture.decisionService.decide.bind(fixture.decisionService);
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.list =
            fixture.decisionService.list.bind(fixture.decisionService);
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.get =
            fixture.decisionService.get.bind(fixture.decisionService);
        const server = await (0, walletConversionDecisionFixtures_1.startDecisionServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/` +
            `wallet-conversion-requests/${fixture.created.conversionReference}/decision`;
        try {
            const send = (token, body) => fetch(url, {
                method: "PATCH", headers: { "content-type": "application/json",
                    ...(token ? { authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(body),
            });
            strict_1.default.equal((await send(undefined, { decision: "APPROVE" })).status, 401);
            strict_1.default.equal((await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.userId), { decision: "APPROVE" })).status, 403);
            strict_1.default.equal((await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.creatorId), { decision: "APPROVE" })).status, 403);
            for (const field of ["adminId", "decidedBy", "decidedAt", "status",
                "sourceAmount", "targetAmount", "rate", "fxSnapshotReference",
                "sourceWalletId", "userId"]) {
                strict_1.default.equal((await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.adminId), { decision: "APPROVE", [field]: "forbidden" })).status, 400);
            }
            const accepted = await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.adminId), { decision: "APPROVE" });
            strict_1.default.equal(accepted.status, 200, await accepted.text());
        }
        finally {
            Object.assign(adminWalletConversionDecision_service_1.adminWalletConversionDecisionService, originals);
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10g Admin list/detail are safe, filtered, ordered, and paginated", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const second = await fixture.requestService.create(fixture.actors.userId.toString(), { sourceCurrency: "INR",
            targetCurrency: "EUR", sourceAmount: 500000,
            idempotencyKey: "phase10g-admin-second" });
        const originals = { decide: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.decide,
            list: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.list,
            get: adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.get };
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.decide =
            fixture.decisionService.decide.bind(fixture.decisionService);
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.list =
            fixture.decisionService.list.bind(fixture.decisionService);
        adminWalletConversionDecision_service_1.adminWalletConversionDecisionService.get =
            fixture.decisionService.get.bind(fixture.decisionService);
        const server = await (0, walletConversionDecisionFixtures_1.startDecisionServer)();
        const base = `${server.baseUrl}/api/v1/admin/financial/wallet-conversion-requests`;
        const headers = { authorization: `Bearer ${(0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.adminId)}` };
        try {
            const listResponse = await fetch(`${base}?status=PENDING&sourceCurrency=INR&limit=1`, { headers });
            const list = await listResponse.json();
            strict_1.default.equal(listResponse.status, 200);
            strict_1.default.equal(list.data.length, 1);
            strict_1.default.equal(list.data[0].conversionReference, fixture.created.conversionReference);
            strict_1.default.equal(unsafe(list.data[0]), false);
            const filteredResponse = await fetch(`${base}?targetCurrency=EUR`, { headers });
            const filtered = await filteredResponse.json();
            strict_1.default.deepEqual(filtered.data.map((item) => item.conversionReference), [second.conversionReference]);
            const detailResponse = await fetch(`${base}/${fixture.created.conversionReference}`, { headers });
            const detail = await detailResponse.json();
            strict_1.default.equal(detailResponse.status, 200);
            strict_1.default.equal(unsafe(detail.data), false);
            strict_1.default.equal((await fetch(`${base}?limit=101`, { headers })).status, 200);
            strict_1.default.equal((await fetch(`${base}?page=0`, { headers })).status, 422);
        }
        finally {
            Object.assign(adminWalletConversionDecision_service_1.adminWalletConversionDecisionService, originals);
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10g User ownership remains scoped and exposes safe decision state", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await fixture.decisionService.decide({
            adminUserId: fixture.actors.adminId.toString(),
            conversionReference: fixture.created.conversionReference,
            decision: "REJECT", rejectionCode: "ADMIN_DECLINED",
            rejectionReason: "Bounded user-visible reason",
        });
        const originals = { listOwn: walletConversionRequest_service_1.walletConversionRequestService.listOwn,
            getOwn: walletConversionRequest_service_1.walletConversionRequestService.getOwn };
        walletConversionRequest_service_1.walletConversionRequestService.listOwn =
            fixture.requestService.listOwn.bind(fixture.requestService);
        walletConversionRequest_service_1.walletConversionRequestService.getOwn =
            fixture.requestService.getOwn.bind(fixture.requestService);
        const server = await (0, walletConversionDecisionFixtures_1.startDecisionServer)();
        const url = `${server.baseUrl}/api/v1/wallet/conversion-requests/` +
            fixture.created.conversionReference;
        try {
            const own = await fetch(url, { headers: { authorization: `Bearer ${(0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.userId)}` } });
            const body = await own.json();
            strict_1.default.equal(own.status, 200);
            strict_1.default.equal(body.data.status, "REJECTED");
            strict_1.default.equal(body.data.rejectionCode, "ADMIN_DECLINED");
            strict_1.default.equal(unsafe(body.data), false);
            const other = await fetch(url, { headers: { authorization: `Bearer ${(0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.creatorId)}` } });
            strict_1.default.equal(other.status, 404);
        }
        finally {
            Object.assign(walletConversionRequest_service_1.walletConversionRequestService, originals);
            await server.close();
        }
    });
};
exports.registerRouteTests = registerRouteTests;
