"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionRequest_service_1 = require("../../../services/financial/walletConversionRequest.service");
const fxRateSnapshotFixtures_1 = require("../phase10e/fixtures/fxRateSnapshotFixtures");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10f replay and service reload return one unchanged request", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const input = (0, walletConversionRequestFixtures_1.requestInput)("phase10f-reload");
        const first = await fixture.service.create(fixture.actors.userId.toString(), input);
        const immediate = await fixture.service.create(fixture.actors.userId.toString(), input);
        const reloadedService = new walletConversionRequest_service_1.WalletConversionRequestService(fixture.fxService);
        const reloaded = await reloadedService.create(fixture.actors.userId.toString(), input);
        strict_1.default.equal(immediate.conversionReference, first.conversionReference);
        strict_1.default.equal(reloaded.conversionReference, first.conversionReference);
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10f replay retains the original snapshot after a newer rate", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const input = (0, walletConversionRequestFixtures_1.requestInput)("phase10f-stale-replay");
        const first = await fixture.service.create(fixture.actors.userId.toString(), input);
        fixture.provider.setRate("INR", "USD", { rate: "0.012000",
            effectiveDate: new Date("2026-08-03T00:00:00.000Z"),
            providerReference: "PHASE10F-INR-USD-V2" });
        await fixture.fxService.refresh("INR", "USD", true, fxRateSnapshotFixtures_1.systemActor);
        const replay = await fixture.service.create(fixture.actors.userId.toString(), input);
        strict_1.default.equal(replay.conversionReference, first.conversionReference);
        strict_1.default.equal(replay.fxSnapshotReference, first.fxSnapshotReference);
        strict_1.default.equal(replay.targetAmount, 10005);
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10f cross-intent replay conflicts while another User key is independent", async () => {
        const first = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const key = "phase10f-conflict";
        await first.service.create(first.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)(key));
        for (const conflicting of [
            { sourceCurrency: "USD", targetCurrency: "INR", sourceAmount: 870000,
                idempotencyKey: key },
            { sourceCurrency: "INR", targetCurrency: "EUR", sourceAmount: 870000,
                idempotencyKey: key },
            { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 870001,
                idempotencyKey: key },
        ]) {
            await strict_1.default.rejects(() => first.service.create(first.actors.userId.toString(), conflicting), (error) => error.code === "WALLET_CONVERSION_IDEMPOTENCY_CONFLICT");
        }
        const second = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const independent = await second.service.create(second.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)(key));
        strict_1.default.ok(independent.conversionReference);
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 2);
    });
};
exports.registerReplayTests = registerReplayTests;
