"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFxServer = exports.token = exports.setRate = exports.systemActor = exports.adminActor = exports.createFxFixture = exports.fxConfig = exports.fixedClock = exports.FIXED_NOW = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fxRate_constants_1 = require("../../../../constants/financial/fxRate.constants");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const admin_financial_routes_1 = __importDefault(require("../../../../routes/v1/admin.financial.routes"));
const wallet_routes_1 = __importDefault(require("../../../../routes/v1/wallet.routes"));
const fxRateSnapshot_service_1 = require("../../../../services/financial/fxRateSnapshot.service");
const topUpFixtures_1 = require("../../phase7h/fixtures/topUpFixtures");
const deterministicFxRateProvider_1 = require("../helpers/deterministicFxRateProvider");
exports.FIXED_NOW = new Date("2026-08-02T12:00:00.000Z");
const fixedClock = () => new Date(exports.FIXED_NOW);
exports.fixedClock = fixedClock;
exports.fxConfig = {
    providerMode: fxRate_constants_1.FxRateProviderMode.REFERENCE,
    providerName: "DETERMINISTIC_FX",
    baseUrl: "https://unused.test/fx",
    timeoutMs: 1000,
    maxAgeMs: 72 * 60 * 60 * 1000,
    snapshotValidityMs: 24 * 60 * 60 * 1000,
    requestEnabled: true,
};
const createFxFixture = async (options) => {
    const actors = await (0, topUpFixtures_1.createActors)();
    const provider = new deterministicFxRateProvider_1.DeterministicFxRateProvider(exports.fixedClock);
    provider.setRate("INR", "USD", {
        rate: "0.011500",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "DAILY-INR-USD-20260802-V1",
        providerPublishedAt: new Date("2026-08-02T06:00:00.000Z"),
    });
    provider.setRate("USD", "INR", {
        rate: "86.956522",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "DAILY-USD-INR-20260802-V1",
    });
    provider.setRate("INR", "EUR", {
        rate: "0.009800",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "DAILY-INR-EUR-20260802-V1",
    });
    provider.setRate("INR", "JPY", {
        rate: "1.720000",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "DAILY-INR-JPY-20260802-V1",
    });
    const service = new fxRateSnapshot_service_1.FxRateSnapshotService(provider, {
        config: exports.fxConfig,
        now: exports.fixedClock,
        failureInjector: options?.failureInjector,
    });
    return { actors, provider, service };
};
exports.createFxFixture = createFxFixture;
const adminActor = (actors) => ({
    type: "ADMIN",
    id: actors.adminId,
});
exports.adminActor = adminActor;
exports.systemActor = { type: "SYSTEM" };
const setRate = (provider, baseCurrency, quoteCurrency, rate, effectiveDate, version) => provider.setRate(baseCurrency, quoteCurrency, {
    rate,
    effectiveDate: new Date(effectiveDate),
    providerReference: `DAILY-${baseCurrency}-${quoteCurrency}-${version}`,
});
exports.setRate = setRate;
const token = (id) => jsonwebtoken_1.default.sign({ id: id.toString(), role: "user" }, process.env.JWT_SECRET);
exports.token = token;
const startFxServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/admin/financial", admin_financial_routes_1.default);
    app.use("/api/v1/wallet", wallet_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("FX test server failed.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startFxServer = startFxServer;
