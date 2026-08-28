"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProviderSelectionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const fxRate_constants_1 = require("../../../constants/financial/fxRate.constants");
const FxRateSnapshotError_1 = require("../../../errors/financial/FxRateSnapshotError");
const configuredReferenceFxRate_provider_1 = require("../../../providers/fx/configuredReferenceFxRate.provider");
const fxRateProvider_selector_1 = require("../../../providers/fx/fxRateProvider.selector");
const internalFxRate_provider_1 = require("../../../providers/fx/internalFxRate.provider");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const internalConfig = () => ({
    providerMode: fxRate_constants_1.FxRateProviderMode.INTERNAL,
    providerName: "",
    baseUrl: "",
    timeoutMs: 1000,
    maxAgeMs: 72 * 60 * 60 * 1000,
    snapshotValidityMs: 24 * 60 * 60 * 1000,
    requestEnabled: false,
    enabledPairs: new Set(["INR:USD"]),
    internalInrUsdRate: "0.01050",
});
const registerProviderSelectionTests = () => {
    (0, node_test_1.test)("phase10e provider selector chooses the configured reference provider", () => {
        const provider = (0, fxRateProvider_selector_1.createFxRateProvider)({
            ...internalConfig(), providerMode: fxRate_constants_1.FxRateProviderMode.REFERENCE,
            providerName: "REFERENCE_TEST", baseUrl: "https://unused.test/fx",
            requestEnabled: true,
        });
        strict_1.default.ok(provider instanceof configuredReferenceFxRate_provider_1.ConfiguredReferenceFxRateProvider);
    });
    (0, node_test_1.test)("phase10e provider selector chooses the internal simulator outside production", () => {
        const provider = (0, fxRateProvider_selector_1.createFxRateProvider)(internalConfig(), { NODE_ENV: "test" });
        strict_1.default.ok(provider instanceof internalFxRate_provider_1.InternalFxRateProvider);
    });
    (0, node_test_1.test)("phase10e invalid provider mode fails closed", () => {
        strict_1.default.throws(() => (0, fxRateProvider_selector_1.createFxRateProvider)({
            ...internalConfig(), providerMode: "UNKNOWN",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
    });
    (0, node_test_1.test)("phase10e internal provider is blocked in production", () => {
        strict_1.default.throws(() => (0, fxRateProvider_selector_1.createFxRateProvider)(internalConfig(), {
            NODE_ENV: "production",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
    });
    (0, node_test_1.test)("phase10e internal provider returns only the configured INR to USD direction", async () => {
        const provider = new internalFxRate_provider_1.InternalFxRateProvider(internalConfig(), () => new Date("2026-08-09T12:00:00.000Z"));
        const result = await provider.getReferenceRate({
            baseCurrency: "INR", quoteCurrency: "USD",
        });
        strict_1.default.equal(result.provider, "INTERNAL_FX_SIMULATOR");
        strict_1.default.equal(result.rate, "0.01050");
        strict_1.default.equal(result.baseCurrency, "INR");
        strict_1.default.equal(result.quoteCurrency, "USD");
        await strict_1.default.rejects(provider.getReferenceRate({
            baseCurrency: "USD", quoteCurrency: "INR",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PAIR_NOT_SUPPORTED");
    });
    (0, node_test_1.test)("phase10e internal provider rejects missing or malformed configured rates", async () => {
        const missing = new internalFxRate_provider_1.InternalFxRateProvider({
            ...internalConfig(), internalInrUsdRate: undefined,
        });
        await strict_1.default.rejects(missing.getReferenceRate({
            baseCurrency: "INR", quoteCurrency: "USD",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
        const malformed = new internalFxRate_provider_1.InternalFxRateProvider({
            ...internalConfig(), internalInrUsdRate: "not-a-rate",
        });
        await strict_1.default.rejects(malformed.getReferenceRate({
            baseCurrency: "INR", quoteCurrency: "USD",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_INVALID_RATE");
    });
    (0, node_test_1.test)("phase10e reference-provider failures do not fall back to the simulator", async () => {
        const provider = (0, fxRateProvider_selector_1.createFxRateProvider)({
            ...internalConfig(), providerMode: fxRate_constants_1.FxRateProviderMode.REFERENCE,
            providerName: "REFERENCE_TEST", baseUrl: "https://unused.test/fx",
            requestEnabled: false,
        });
        await strict_1.default.rejects(provider.getReferenceRate({
            baseCurrency: "INR", quoteCurrency: "USD",
        }), (error) => error instanceof FxRateSnapshotError_1.FxRateSnapshotError &&
            error.code === "FX_RATE_PROVIDER_NOT_CONFIGURED");
    });
    (0, node_test_1.test)("phase10e internal refresh persists and reads an eligible INR to USD snapshot", async () => {
        const service = new fxRateSnapshot_service_1.FxRateSnapshotService(undefined, {
            config: internalConfig(), now: () => new Date(),
        });
        const refreshed = await service.refresh("INR", "USD", true, fxRateSnapshotFixtures_1.systemActor);
        const current = await service.getCurrent("INR", "USD");
        strict_1.default.equal(refreshed.provider, "INTERNAL_FX_SIMULATOR");
        strict_1.default.equal(refreshed.rate, "0.0105");
        strict_1.default.equal(current.snapshotReference, refreshed.snapshotReference);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({
            provider: "INTERNAL_FX_SIMULATOR", baseCurrency: "INR", quoteCurrency: "USD",
        }), 1);
    });
};
exports.registerProviderSelectionTests = registerProviderSelectionTests;
