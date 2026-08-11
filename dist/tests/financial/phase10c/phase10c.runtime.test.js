"use strict";
/// <reference path="../../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const node_test_1 = require("node:test");
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supportedCurrencies_1 = require("../../../constants/financial/supportedCurrencies");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const walletTopUpDecision_enum_1 = require("../../../enums/financial/walletTopUpDecision.enum");
const WalletError_1 = require("../../../errors/financial/WalletError");
const errorHandler_1 = require("../../../middlewares/errorHandler");
const notFound_1 = require("../../../middlewares/notFound");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const wallet_routes_1 = __importDefault(require("../../../routes/v1/wallet.routes"));
const adminWalletTopUpDecision_service_1 = require("../../../services/financial/adminWalletTopUpDecision.service");
const currencyMetadata_service_1 = require("../../../services/financial/currencyMetadata.service");
const topUpAccountingOrchestrator_service_1 = require("../../../services/financial/topUpAccountingOrchestrator.service");
const topUpFundingOrchestrator_service_1 = require("../../../services/financial/topUpFundingOrchestrator.service");
const walletTopUpRequest_service_1 = require("../../../services/financial/walletTopUpRequest.service");
const walletCreation_service_1 = require("../../../services/wallet/walletCreation.service");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const database_1 = require("../phase7h/helpers/database");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10c-test-jwt-secret";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const completeTopUp = async (actors, currency, amount, idempotencyKey) => {
    const request = await walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), { amount, currency, idempotencyKey });
    await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({
        adminUserId: actors.adminId.toString(),
        topUpReference: request.topUpReference,
        decision: walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE,
    });
    await topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.start({
        topUpReference: request.topUpReference,
        outcome: internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS,
    });
    const accounting = await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(request.topUpReference);
    return { request, accounting };
};
const startWalletServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/wallet", wallet_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Server failed.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
(0, node_test_1.test)("phase10c creates and reuses supported currency Wallet buckets", async () => {
    const actors = await (0, topUpFixtures_1.createActors)();
    const defaultWallet = await walletCreation_service_1.walletCreationService.createWallet(actors.userId);
    strict_1.default.equal(defaultWallet.currency, "INR");
    strict_1.default.equal(defaultWallet._id.toString(), actors.wallet._id.toString());
    const first = await walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD");
    const replay = await walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD");
    strict_1.default.equal(first._id.toString(), replay._id.toString());
    strict_1.default.deepEqual([first.availableBalance, first.reservedBalance,
        first.lockedBalance, first.currentBalance], [0, 0, 0, 0]);
    strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: actors.userId }), 2);
    await strict_1.default.rejects(() => walletCreation_service_1.walletCreationService.createWallet(actors.userId, "XYZ"), (error) => error instanceof WalletError_1.WalletError &&
        error.code === "WALLET_UNSUPPORTED_CURRENCY");
    const jpy = currencyMetadata_service_1.currencyMetadataService.get("JPY");
    strict_1.default.deepEqual(jpy, { code: "JPY", displayName: "Japanese Yen",
        symbol: "¥", minorUnits: 0, enabled: true });
    strict_1.default.equal(currencyMetadata_service_1.currencyMetadataService.listEnabled().length, supportedCurrencies_1.SUPPORTED_CURRENCIES.length);
});
(0, node_test_1.test)("phase10c ten concurrent creations converge on one USD Wallet", async () => {
    const actors = await (0, topUpFixtures_1.createActors)();
    const wallets = await Promise.all(Array.from({ length: 10 }, () => walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD")));
    strict_1.default.equal(new Set(wallets.map((wallet) => wallet._id.toString())).size, 1);
    strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
        userId: actors.userId,
        currency: "USD",
    }), 1);
});
(0, node_test_1.test)("phase10c USD top-up creates and credits only the USD Wallet", async () => {
    const actors = await (0, topUpFixtures_1.createActors)();
    const first = await completeTopUp(actors, "USD", 100, "phase10c-usd-top-up");
    const replayRequest = await walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), { amount: 100, currency: "USD", idempotencyKey: "phase10c-usd-top-up" });
    const replayAccounting = await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(first.request.topUpReference);
    strict_1.default.equal(replayRequest.topUpReference, first.request.topUpReference);
    strict_1.default.equal(replayAccounting.transactionId, first.accounting.transactionId);
    const [inr, usd, entries, projections] = await Promise.all([
        wallet_model_1.Wallet.findOne({ userId: actors.userId, currency: "INR" }).orFail(),
        wallet_model_1.Wallet.findOne({ userId: actors.userId, currency: "USD" }).orFail(),
        ledgerEntry_model_1.LedgerEntry.find({ source: ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING }),
        walletProjectionOperation_model_1.WalletProjectionOperation.find({ userId: actors.userId }),
    ]);
    strict_1.default.deepEqual([inr.availableBalance, inr.currentBalance], [0, 0]);
    strict_1.default.deepEqual([usd.availableBalance, usd.currentBalance], [100, 100]);
    strict_1.default.equal(entries.length, 1);
    strict_1.default.equal(entries[0].currency, "USD");
    strict_1.default.equal(projections.length, 1);
    strict_1.default.equal(projections[0].currency, "USD");
    strict_1.default.ok(projections[0].walletId.equals(usd._id));
    strict_1.default.ok(!projections[0].walletId.equals(inr._id));
});
(0, node_test_1.test)("phase10c authenticated Wallet listing returns every owned currency", async () => {
    const actors = await (0, topUpFixtures_1.createActors)();
    await Promise.all([
        walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD"),
        walletCreation_service_1.walletCreationService.createWallet(actors.userId, "EUR"),
    ]);
    const token = jsonwebtoken_1.default.sign({ id: actors.userId.toString(), role: "user" }, process.env.JWT_SECRET);
    const server = await startWalletServer();
    try {
        const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
            headers: { authorization: `Bearer ${token}` },
        });
        const body = await response.json();
        strict_1.default.equal(response.status, 200, JSON.stringify(body));
        strict_1.default.deepEqual(body.data.map((item) => item.currency), ["EUR", "INR", "USD"]);
        strict_1.default.ok(body.data.every((item) => item.available === 0 && item.reserved === 0 && item.locked === 0 &&
            item.current === 0 && typeof item.createdAt === "string"));
        strict_1.default.ok(body.data.every((item) => !Object.keys(item).some((key) => ["userId", "walletId", "_id",
            "projectionVersion"].includes(key))));
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.test)("phase10c MongoDB preserves the authoritative user-currency identity", async () => {
    const actors = await (0, topUpFixtures_1.createActors)();
    await walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD");
    await strict_1.default.rejects(() => wallet_model_1.Wallet.create({
        userId: actors.userId,
        currency: "USD",
    }), (error) => error?.code === 11000);
    const indexes = await wallet_model_1.Wallet.collection.indexes();
    const ownership = indexes.find((index) => index.key.userId === 1 && index.key.currency === 1);
    strict_1.default.ok(ownership);
    strict_1.default.equal(ownership.unique, true);
});
