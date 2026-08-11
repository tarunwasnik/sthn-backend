"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const walletConversionProviderFixtures_1 = require("../phase10h/fixtures/walletConversionProviderFixtures");
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10i accounting does not mutate unrelated financial domains or FX", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        const before = await (0, walletConversionAccountingFixtures_1.captureUnrelatedFinancialState)();
        await (0, walletConversionAccountingFixtures_1.account)(fixture);
        strict_1.default.deepEqual(await (0, walletConversionAccountingFixtures_1.captureUnrelatedFinancialState)(), before);
        const snapshot = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({
            snapshotReference: fixture.request.fxSnapshotReference,
        }).orFail();
        strict_1.default.equal(snapshot.snapshotReference, fixture.request.fxSnapshotReference);
        strict_1.default.equal(fixture.executions, 1);
    });
    (0, node_test_1.test)("phase10i Admin accounting route is protected, bodyless, and safe", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        const server = await (0, walletConversionProviderFixtures_1.startDecisionServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/` +
            `wallet-conversion-requests/${fixture.created.conversionReference}/` +
            "complete-accounting";
        const send = (token, body) => fetch(url, {
            method: "POST",
            headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(body ? { "content-type": "application/json" } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        try {
            strict_1.default.equal((await send()).status, 401);
            strict_1.default.equal((await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.userId))).status, 403);
            strict_1.default.equal((await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.adminId), { sourceAmount: 1 })).status, 400);
            const accepted = await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.adminId));
            strict_1.default.equal(accepted.status, 200);
            const response = await accepted.json();
            strict_1.default.deepEqual(Object.keys(response.data).sort(), ["completedAt",
                "conversionReference", "sourceAmount", "sourceCurrency", "status",
                "targetAmount", "targetCurrency"].sort());
        }
        finally {
            await server.close();
        }
    });
};
exports.registerRegressionTests = registerRegressionTests;
