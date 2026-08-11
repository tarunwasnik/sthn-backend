"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10f concurrency: ten identical requests converge", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-ten-identical"))));
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
        const references = settled.map((item) => item.status === "fulfilled"
            ? item.value.conversionReference : "FAILED");
        strict_1.default.equal(new Set(references).size, 1);
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 1);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10f concurrency: independent directed pairs bind independent snapshots", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await (0, walletConversionRequestFixtures_1.fundWallet)(fixture.actors.userId, "USD", 100000);
        const settled = await Promise.allSettled([
            fixture.service.create(fixture.actors.userId.toString(), {
                sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 100000,
                idempotencyKey: "phase10f-independent-usd"
            }),
            fixture.service.create(fixture.actors.userId.toString(), {
                sourceCurrency: "INR", targetCurrency: "EUR", sourceAmount: 100000,
                idempotencyKey: "phase10f-independent-eur"
            }),
            fixture.service.create(fixture.actors.userId.toString(), {
                sourceCurrency: "USD", targetCurrency: "JPY", sourceAmount: 10000,
                idempotencyKey: "phase10f-independent-jpy"
            }),
        ]);
        strict_1.default.equal(settled.every((item) => item.status === "fulfilled"), true);
        const requests = await walletConversionRequest_model_1.WalletConversionRequest.find({});
        strict_1.default.equal(requests.length, 3);
        strict_1.default.equal(new Set(requests.map((item) => item.fxSnapshotReference)).size, 3);
    });
    (0, node_test_1.test)("phase10f concurrency: conflicting idempotency race has one authority", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const key = "phase10f-race-conflict";
        const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => fixture.service.create(fixture.actors.userId.toString(), {
            sourceCurrency: "INR", targetCurrency: "USD",
            sourceAmount: index % 2 === 0 ? 100000 : 200000,
            idempotencyKey: key,
        })));
        strict_1.default.ok(settled.some((item) => item.status === "fulfilled"));
        strict_1.default.ok(settled.some((item) => item.status === "rejected"));
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 1);
        const stored = await walletConversionRequest_model_1.WalletConversionRequest.findOne({});
        const successes = settled.filter((item) => item.status === "fulfilled");
        strict_1.default.ok(successes.every((item) => item.value.sourceAmount ===
            stored?.sourceAmount));
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
