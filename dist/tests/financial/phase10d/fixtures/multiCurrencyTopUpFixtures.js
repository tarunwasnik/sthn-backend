"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWalletServer = exports.authToken = exports.getWallet = exports.reloadTopUp = exports.completeDirectTopUp = exports.completeAccounting = exports.succeedFunding = exports.approveTopUp = exports.requestTopUp = exports.createMultiCurrencyActors = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const internalTopUpFundingOutcome_enum_1 = require("../../../../enums/financial/internalTopUpFundingOutcome.enum");
const walletTopUpDecision_enum_1 = require("../../../../enums/financial/walletTopUpDecision.enum");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const wallet_routes_1 = __importDefault(require("../../../../routes/v1/wallet.routes"));
const adminWalletTopUpDecision_service_1 = require("../../../../services/financial/adminWalletTopUpDecision.service");
const topUpAccountingOrchestrator_service_1 = require("../../../../services/financial/topUpAccountingOrchestrator.service");
const topUpFundingOrchestrator_service_1 = require("../../../../services/financial/topUpFundingOrchestrator.service");
const walletTopUpRequest_service_1 = require("../../../../services/financial/walletTopUpRequest.service");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const topUpFixtures_1 = require("../../phase7h/fixtures/topUpFixtures");
let sequence = 0;
const createMultiCurrencyActors = async (initialInrBalance = 0) => {
    const actors = await (0, topUpFixtures_1.createActors)();
    if (initialInrBalance > 0) {
        await wallet_model_1.Wallet.collection.updateOne({ _id: actors.wallet._id }, { $set: {
                availableBalance: initialInrBalance,
                currentBalance: initialInrBalance,
            } });
    }
    return actors;
};
exports.createMultiCurrencyActors = createMultiCurrencyActors;
const requestTopUp = async (actors, currency, amount, idempotencyKey) => {
    sequence += 1;
    return walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), {
        currency,
        amount,
        idempotencyKey: idempotencyKey ??
            `phase10d-${currency.toLowerCase()}-${sequence}`,
    });
};
exports.requestTopUp = requestTopUp;
const approveTopUp = async (actors, topUpReference) => adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({
    adminUserId: actors.adminId.toString(),
    topUpReference,
    decision: walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE,
});
exports.approveTopUp = approveTopUp;
const succeedFunding = async (topUpReference) => topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.start({
    topUpReference,
    outcome: internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS,
});
exports.succeedFunding = succeedFunding;
const completeAccounting = async (topUpReference) => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(topUpReference);
exports.completeAccounting = completeAccounting;
const completeDirectTopUp = async (actors, currency, amount, idempotencyKey) => {
    const request = await (0, exports.requestTopUp)(actors, currency, amount, idempotencyKey);
    const approved = await (0, exports.approveTopUp)(actors, request.topUpReference);
    const funding = await (0, exports.succeedFunding)(request.topUpReference);
    const accounting = await (0, exports.completeAccounting)(request.topUpReference);
    return { request, approved, funding, accounting };
};
exports.completeDirectTopUp = completeDirectTopUp;
const reloadTopUp = async (topUpReference) => {
    const request = await walletTopUpRequest_model_1.WalletTopUpRequest.findOne({ topUpReference })
        .select("+requestFingerprint +providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy")
        .exec();
    if (!request)
        throw new Error("Phase 10D top-up request was not found.");
    return request;
};
exports.reloadTopUp = reloadTopUp;
const getWallet = async (userId, currency) => wallet_model_1.Wallet.findOne({ userId, currency }).orFail();
exports.getWallet = getWallet;
const authToken = (userId) => jsonwebtoken_1.default.sign({ id: userId.toString(), role: "user" }, process.env.JWT_SECRET);
exports.authToken = authToken;
const startWalletServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/wallet", wallet_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Phase 10D HTTP server did not bind.");
    }
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startWalletServer = startWalletServer;
