"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRefreshTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const FxRateSnapshotError_1 = require("../../../errors/financial/FxRateSnapshotError");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerRefreshTests = () => {
    (0, node_test_1.test)("phase10e refresh failure returns a still-valid current snapshot explicitly as fallback", async () => {
        const { actors, provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const first = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        provider.setFailure(new FxRateSnapshotError_1.FxRateSnapshotError("Provider unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502));
        const fallback = await service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        strict_1.default.equal(fallback.snapshotReference, first.snapshotReference);
        strict_1.default.equal(fallback.cached, true);
        strict_1.default.equal(fallback.cachedFallback, true);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10e refresh failure never returns an expired snapshot as current", async () => {
        const fixture = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        await fixture.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        fixture.provider.setFailure(new FxRateSnapshotError_1.FxRateSnapshotError("Provider unavailable.", "FX_RATE_PROVIDER_UNAVAILABLE", 502));
        const expiredNow = () => new Date(fxRateSnapshotFixtures_1.FIXED_NOW.getTime() + fxRateSnapshotFixtures_1.fxConfig.snapshotValidityMs + 1);
        const expiredService = new fxRateSnapshot_service_1.FxRateSnapshotService(fixture.provider, {
            config: fxRateSnapshotFixtures_1.fxConfig, now: expiredNow,
        });
        await strict_1.default.rejects(() => expiredService.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(fixture.actors)), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PROVIDER_UNAVAILABLE");
        await strict_1.default.rejects(() => expiredService.getCurrent("INR", "USD"), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_SNAPSHOT_EXPIRED");
    });
};
exports.registerRefreshTests = registerRefreshTests;
