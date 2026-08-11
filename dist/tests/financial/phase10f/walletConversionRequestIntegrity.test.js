"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const fxRate_constants_1 = require("../../../constants/financial/fxRate.constants");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const walletConversionRequest_service_1 = require("../../../services/financial/walletConversionRequest.service");
const fxRateSnapshotFixtures_1 = require("../phase10e/fixtures/fxRateSnapshotFixtures");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerIntegrityTests = () => {
    (0, node_test_1.test)("phase10f integrity rejects unsupported, identical, and invalid amounts", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        for (const input of [
            { sourceCurrency: "XXX", targetCurrency: "USD", sourceAmount: 1 },
            { sourceCurrency: "INR", targetCurrency: "XXX", sourceAmount: 1 },
            { sourceCurrency: "INR", targetCurrency: "INR", sourceAmount: 1 },
            { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 0 },
            { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: -1 },
            { sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 1.5 },
            { sourceCurrency: "INR", targetCurrency: "USD",
                sourceAmount: Number.MAX_SAFE_INTEGER + 1 },
        ]) {
            await strict_1.default.rejects(() => fixture.service.create(fixture.actors.userId.toString(), { ...input,
                idempotencyKey: `phase10f-invalid-${JSON.stringify(input)}` }));
        }
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10f integrity rejects missing Wallet and insufficient balance", async () => {
        const missing = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await (0, walletConversionRequestFixtures_1.fundWallet)(new mongoose_1.Types.ObjectId(), "USD", 1000);
        await strict_1.default.rejects(() => missing.service.create(missing.actors.userId.toString(), { sourceCurrency: "USD",
            targetCurrency: "JPY", sourceAmount: 1,
            idempotencyKey: "phase10f-missing-wallet" }), (error) => error.code === "WALLET_CONVERSION_SOURCE_WALLET_NOT_FOUND");
        const insufficient = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await strict_1.default.rejects(() => insufficient.service.create(insufficient.actors.userId.toString(), { ...(0, walletConversionRequestFixtures_1.requestInput)("insufficient"),
            sourceAmount: 2000001 }), (error) => error.code ===
            "WALLET_CONVERSION_INSUFFICIENT_AVAILABLE_BALANCE");
    });
    (0, node_test_1.test)("phase10f integrity requires the exact stored directed snapshot and valid pagination", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await (0, walletConversionRequestFixtures_1.fundWallet)(fixture.actors.userId, "USD", 10000);
        await strict_1.default.rejects(() => fixture.service.create(fixture.actors.userId.toString(), { sourceCurrency: "USD",
            targetCurrency: "INR", sourceAmount: 1000,
            idempotencyKey: "phase10f-wrong-directed-pair" }), (error) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_NOT_FOUND");
        await strict_1.default.rejects(() => fixture.service.listOwn(fixture.actors.userId.toString(), "0", "20"), (error) => error.code === "WALLET_CONVERSION_INVALID_PAGINATION");
    });
    (0, node_test_1.test)("phase10f integrity rejects expired, invalidated, and corrupted snapshots", async () => {
        const expired = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const lateFx = new fxRateSnapshot_service_1.FxRateSnapshotService(expired.provider, { config: fxRateSnapshotFixtures_1.fxConfig,
            now: () => new Date(fxRateSnapshotFixtures_1.FIXED_NOW.getTime() +
                fxRate_constants_1.FX_RATE_DEFAULT_SNAPSHOT_VALIDITY_MS + 1) });
        const lateService = new walletConversionRequest_service_1.WalletConversionRequestService(lateFx);
        await strict_1.default.rejects(() => lateService.create(expired.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-expired")), (error) => error.code ===
            "WALLET_CONVERSION_FX_SNAPSHOT_EXPIRED");
        const invalidated = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.updateOne({ baseCurrency: "INR",
            quoteCurrency: "USD" }, { $set: { status: "INVALIDATED" } });
        await strict_1.default.rejects(() => invalidated.service.create(invalidated.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-invalidated")));
        const corrupted = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.updateOne({ baseCurrency: "INR",
            quoteCurrency: "EUR" }, { $set: { rateValue: "999" } });
        await strict_1.default.rejects(() => corrupted.service.create(corrupted.actors.userId.toString(), { sourceCurrency: "INR",
            targetCurrency: "EUR", sourceAmount: 100000,
            idempotencyKey: "phase10f-corrupt-rate" }), (error) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT");
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.updateOne({ baseCurrency: "INR",
            quoteCurrency: "JPY" }, { $set: { snapshotFingerprint: "0".repeat(64) } });
        await strict_1.default.rejects(() => corrupted.service.create(corrupted.actors.userId.toString(), { sourceCurrency: "INR",
            targetCurrency: "JPY", sourceAmount: 100000,
            idempotencyKey: "phase10f-snapshot-fingerprint" }), (error) => error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT");
    });
    (0, node_test_1.test)("phase10f integrity rejects disabled pair and zero-minor target quote", async () => {
        const disabled = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const restrictedFx = new fxRateSnapshot_service_1.FxRateSnapshotService(disabled.provider, {
            config: { ...fxRateSnapshotFixtures_1.fxConfig, enabledPairs: new Set(["INR:EUR"]) },
            now: () => new Date(fxRateSnapshotFixtures_1.FIXED_NOW),
        });
        await strict_1.default.rejects(() => new walletConversionRequest_service_1.WalletConversionRequestService(restrictedFx)
            .create(disabled.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("disabled-pair")), (error) => error.code === "WALLET_CONVERSION_UNSUPPORTED_PAIR");
        const zero = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        zero.provider.setRate("INR", "USD", { rate: "0.000001",
            effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
            providerReference: "PHASE10F-TINY-RATE" });
        await zero.fxService.refresh("INR", "USD", true, fxRateSnapshotFixtures_1.systemActor);
        await strict_1.default.rejects(() => zero.service.create(zero.actors.userId.toString(), {
            sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 1,
            idempotencyKey: "phase10f-zero-target",
        }), (error) => error.code === "WALLET_CONVERSION_TARGET_AMOUNT_ZERO");
    });
    (0, node_test_1.test)("phase10f integrity detects request fingerprint mismatch", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const input = (0, walletConversionRequestFixtures_1.requestInput)("phase10f-fingerprint");
        const created = await fixture.service.create(fixture.actors.userId.toString(), input);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({
            conversionReference: created.conversionReference,
        }, { $set: { requestFingerprint: "0".repeat(64) } });
        await strict_1.default.rejects(() => fixture.service.create(fixture.actors.userId.toString(), input), (error) => error.code === "WALLET_CONVERSION_INTEGRITY_ERROR");
    });
    (0, node_test_1.test)("phase10f minor units cover zero-decimal source and maximum bounded amount", async () => {
        const zeroSource = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        await (0, walletConversionRequestFixtures_1.fundWallet)(zeroSource.actors.userId, "JPY", 1000);
        const smallest = await zeroSource.service.create(zeroSource.actors.userId.toString(), { sourceCurrency: "JPY",
            targetCurrency: "USD", sourceAmount: 1,
            idempotencyKey: "phase10f-jpy-usd-smallest" });
        strict_1.default.equal(smallest.targetAmount, 1);
        const roundedUp = await zeroSource.service.create(zeroSource.actors.userId.toString(), { sourceCurrency: "INR",
            targetCurrency: "JPY", sourceAmount: 12375,
            idempotencyKey: "phase10f-inr-jpy-round-up" });
        strict_1.default.equal(roundedUp.targetAmount, 213);
        const maximum = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const max = 999999999999;
        await wallet_model_1.Wallet.findByIdAndUpdate(maximum.actors.wallet._id, { $set: {
                currentBalance: max, availableBalance: max,
            } }, { runValidators: true });
        const result = await maximum.service.create(maximum.actors.userId.toString(), {
            sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: max,
            idempotencyKey: "phase10f-maximum",
        });
        strict_1.default.equal(Number.isSafeInteger(result.targetAmount), true);
        strict_1.default.ok(result.targetAmount > 0);
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
