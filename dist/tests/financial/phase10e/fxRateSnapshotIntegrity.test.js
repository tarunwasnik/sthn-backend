"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const FxRateSnapshotError_1 = require("../../../errors/financial/FxRateSnapshotError");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerIntegrityTests = () => {
    (0, node_test_1.test)("phase10e integrity rejects unsupported, identical, and disabled pairs", async () => {
        const { provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        await strict_1.default.rejects(() => service.lookupOrRefresh("XYZ", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_UNSUPPORTED_BASE_CURRENCY");
        await strict_1.default.rejects(() => service.lookupOrRefresh("INR", "XYZ", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_UNSUPPORTED_QUOTE_CURRENCY");
        await strict_1.default.rejects(() => service.lookupOrRefresh("INR", "INR", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_IDENTICAL_CURRENCIES");
        const restricted = new fxRateSnapshot_service_1.FxRateSnapshotService(provider, {
            config: { ...fxRateSnapshotFixtures_1.fxConfig, enabledPairs: new Set(["INR:USD"]) },
            now: fxRateSnapshotFixtures_1.fixedClock,
        });
        await strict_1.default.rejects(() => restricted.lookupOrRefresh("INR", "EUR", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_PAIR_NOT_SUPPORTED");
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 0);
    });
    for (const [label, rate] of [
        ["zero", "0"], ["negative", "-0.1"], ["malformed", "1.2.3"],
        ["excessive scale", "0.1234567890123"],
    ]) {
        (0, node_test_1.test)(`phase10e integrity rejects ${label} provider rate`, async () => {
            const { provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
            provider.setRate("INR", "USD", {
                rate, effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
                providerReference: `INVALID-${label}`,
            });
            await strict_1.default.rejects(() => service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
                error.code === "FX_RATE_INVALID_RATE");
            strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 0);
        });
    }
    (0, node_test_1.test)("phase10e integrity rejects future, stale, wrong-pair, and inverse-mismatch responses", async () => {
        const future = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        future.provider.setRate("INR", "USD", { rate: "0.0115",
            effectiveDate: new Date("2026-08-05T00:00:00.000Z") });
        await strict_1.default.rejects(() => future.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_INVALID_EFFECTIVE_DATE");
        const stale = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        stale.provider.setRate("INR", "USD", { rate: "0.0115",
            effectiveDate: new Date("2026-07-20T00:00:00.000Z") });
        await strict_1.default.rejects(() => stale.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_STALE_PROVIDER_RESPONSE");
        const wrong = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        wrong.provider.setRate("INR", "USD", { rate: "0.0115",
            effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
            returnedQuoteCurrency: "EUR" });
        await strict_1.default.rejects(() => wrong.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_PROVIDER_INVALID_RESPONSE");
        const inverse = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        inverse.provider.setRate("INR", "USD", { rate: "0.0115",
            inverseRate: "90", effectiveDate: new Date("2026-08-02T00:00:00.000Z") });
        await strict_1.default.rejects(() => inverse.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor), (error) => error.code === "FX_RATE_INVALID_RATE");
    });
    (0, node_test_1.test)("phase10e integrity detects corrupted immutable fingerprint and duplicate ACTIVE authority", async () => {
        const { service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const dto = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        const original = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({
            snapshotReference: dto.snapshotReference,
        }).select("+snapshotKey +responseFingerprint +snapshotFingerprint +createdBy")
            .lean().orFail();
        const duplicate = { ...original, _id: undefined,
            snapshotReference: "FXR-20260802-DEADBEEF",
            snapshotKey: "f".repeat(64), createdAt: undefined, updatedAt: undefined };
        await strict_1.default.rejects(() => exchangeRateSnapshot_model_1.ExchangeRateSnapshot.create(duplicate), (error) => error?.code === 11000);
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.updateOne({ snapshotReference: dto.snapshotReference }, { $set: { rateValue: "999" } });
        await strict_1.default.rejects(() => service.getCurrent("INR", "USD"), (error) => error.code === "FX_RATE_REPLAY_CONFLICT");
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
