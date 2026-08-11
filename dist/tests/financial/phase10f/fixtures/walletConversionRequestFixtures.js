"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConversionServer = exports.authToken = exports.requestInput = exports.createConversionFixture = exports.fundWallet = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const wallet_model_1 = require("../../../../models/wallet.model");
const wallet_routes_1 = __importDefault(require("../../../../routes/v1/wallet.routes"));
const fxRateSnapshot_service_1 = require("../../../../services/financial/fxRateSnapshot.service");
const walletConversionRequest_service_1 = require("../../../../services/financial/walletConversionRequest.service");
const topUpFixtures_1 = require("../../phase7h/fixtures/topUpFixtures");
const deterministicFxRateProvider_1 = require("../../phase10e/helpers/deterministicFxRateProvider");
const fxRateSnapshotFixtures_1 = require("../../phase10e/fixtures/fxRateSnapshotFixtures");
const fundWallet = async (userId, currency, amount = 1000000) => wallet_model_1.Wallet.create({ userId, currency,
    currentBalance: amount, availableBalance: amount });
exports.fundWallet = fundWallet;
const createConversionFixture = async (options) => {
    const actors = await (0, topUpFixtures_1.createActors)();
    await wallet_model_1.Wallet.findByIdAndUpdate(actors.wallet._id, { $set: {
            currentBalance: 2000000, availableBalance: 2000000,
        } }, { runValidators: true });
    actors.wallet = (await wallet_model_1.Wallet.findById(actors.wallet._id));
    if (options?.createUsdWallet)
        await (0, exports.fundWallet)(actors.userId, "USD", 500000);
    const provider = new deterministicFxRateProvider_1.DeterministicFxRateProvider(fxRateSnapshotFixtures_1.fixedClock);
    provider.setRate("INR", "USD", { rate: "0.011500",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "PHASE10F-INR-USD-V1" });
    provider.setRate("INR", "EUR", { rate: "0.009800",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "PHASE10F-INR-EUR-V1" });
    provider.setRate("INR", "JPY", { rate: "1.720000",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "PHASE10F-INR-JPY-V1" });
    provider.setRate("USD", "JPY", { rate: "150.250000",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "PHASE10F-USD-JPY-V1" });
    provider.setRate("JPY", "USD", { rate: "0.006656",
        effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
        providerReference: "PHASE10F-JPY-USD-V1" });
    const fxService = new fxRateSnapshot_service_1.FxRateSnapshotService(provider, {
        config: fxRateSnapshotFixtures_1.fxConfig, now: fxRateSnapshotFixtures_1.fixedClock,
    });
    await Promise.all([
        fxService.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor),
        fxService.lookupOrRefresh("INR", "EUR", fxRateSnapshotFixtures_1.systemActor),
        fxService.lookupOrRefresh("INR", "JPY", fxRateSnapshotFixtures_1.systemActor),
        fxService.lookupOrRefresh("USD", "JPY", fxRateSnapshotFixtures_1.systemActor),
        fxService.lookupOrRefresh("JPY", "USD", fxRateSnapshotFixtures_1.systemActor),
    ]);
    const service = new walletConversionRequest_service_1.WalletConversionRequestService(fxService, undefined, {
        now: () => new Date(fxRateSnapshotFixtures_1.FIXED_NOW),
        failureInjector: options?.failureInjector,
    });
    return { actors, provider, fxService, service };
};
exports.createConversionFixture = createConversionFixture;
const requestInput = (key = "phase10f-inr-usd") => ({
    sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 870000,
    idempotencyKey: key,
});
exports.requestInput = requestInput;
const authToken = (id) => jsonwebtoken_1.default.sign({
    id: id.toString(), role: "user",
}, process.env.JWT_SECRET);
exports.authToken = authToken;
const startConversionServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/wallet", wallet_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Test server failed.");
    return { baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
};
exports.startConversionServer = startConversionServer;
