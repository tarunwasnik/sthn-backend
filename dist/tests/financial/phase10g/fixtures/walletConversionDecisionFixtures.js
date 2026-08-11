"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDecisionServer = exports.authToken = exports.reject = exports.approve = exports.createDecisionFixture = exports.captureNoMoneyState = exports.DECISION_NOW = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const mongoose_1 = require("mongoose");
const booking_model_1 = require("../../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../../models/bookingFundReservation.model");
const creatorWithdrawalRequest_model_1 = require("../../../../models/creatorWithdrawalRequest.model");
const exchangeRateSnapshot_model_1 = require("../../../../models/exchangeRateSnapshot.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const internalTopUpFunding_model_1 = require("../../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../../models/payment.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const walletConversionRequest_model_1 = require("../../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const admin_financial_routes_1 = __importDefault(require("../../../../routes/v1/admin.financial.routes"));
const wallet_routes_1 = __importDefault(require("../../../../routes/v1/wallet.routes"));
const adminWalletConversionDecision_service_1 = require("../../../../services/financial/adminWalletConversionDecision.service");
const fxRateSnapshot_service_1 = require("../../../../services/financial/fxRateSnapshot.service");
const walletConversionRequest_service_1 = require("../../../../services/financial/walletConversionRequest.service");
const fxRateSnapshotFixtures_1 = require("../../phase10e/fixtures/fxRateSnapshotFixtures");
const walletConversionRequestFixtures_1 = require("../../phase10f/fixtures/walletConversionRequestFixtures");
Object.defineProperty(exports, "authToken", { enumerable: true, get: function () { return walletConversionRequestFixtures_1.authToken; } });
exports.DECISION_NOW = new Date("2026-08-02T13:00:00.000Z");
const captureNoMoneyState = async () => ({
    counts: await Promise.all([
        wallet_model_1.Wallet.countDocuments({}), ledgerEntry_model_1.LedgerEntry.countDocuments({}),
        walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), booking_model_1.Booking.countDocuments({}),
        payment_model_1.Payment.countDocuments({}), bookingFundReservation_model_1.BookingFundReservation.countDocuments({}),
        bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({}),
        bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({}),
        creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments({}),
        internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({}),
        internalProviderEvent_model_1.default.countDocuments({}),
        walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}),
        internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
    ]),
    wallets: await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(),
    snapshots: await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({})
        .sort({ snapshotReference: 1 })
        .select("+snapshotFingerprint +responseFingerprint").lean(),
});
exports.captureNoMoneyState = captureNoMoneyState;
const createDecisionFixture = async (options) => {
    const conversion = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
    if (options?.createTargetWallet) {
        await (0, walletConversionRequestFixtures_1.fundWallet)(conversion.actors.userId, "USD", 25000);
    }
    const created = await conversion.service.create(conversion.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)(`phase10g-${new mongoose_1.Types.ObjectId().toString()}`));
    const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
        conversionReference: created.conversionReference,
    }).select("+conversionKey +userId +sourceWalletId +targetWalletId +fxSnapshotId " +
        "+rateValue +rateScale +inverseRateValue +inverseRateScale " +
        "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
        "+decidedBy");
    if (!request)
        throw new Error("Phase 10G request fixture was not persisted.");
    const decisionNow = options?.decisionNow ?? exports.DECISION_NOW;
    const decisionFx = options?.decisionNow
        ? new fxRateSnapshot_service_1.FxRateSnapshotService(conversion.provider, { config: fxRateSnapshotFixtures_1.fxConfig,
            now: () => new Date(decisionNow) })
        : conversion.fxService;
    const requestService = options?.decisionNow
        ? new walletConversionRequest_service_1.WalletConversionRequestService(decisionFx)
        : conversion.service;
    const decisionService = new adminWalletConversionDecision_service_1.AdminWalletConversionDecisionService(requestService, { now: () => new Date(decisionNow),
        failureInjector: options?.failureInjector });
    return { ...conversion, request, created, decisionService, requestService,
        decisionNow };
};
exports.createDecisionFixture = createDecisionFixture;
const approve = (fixture) => fixture.decisionService.decide({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    decision: "APPROVE",
});
exports.approve = approve;
const reject = (fixture, rejectionCode = "ADMIN_DECLINED", rejectionReason = "Admin declined this request") => fixture.decisionService.decide({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    decision: "REJECT", rejectionCode, rejectionReason,
});
exports.reject = reject;
const startDecisionServer = async () => {
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
        throw new Error("Test server failed.");
    return { baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, rejectClose) => server.close((error) => error ? rejectClose(error) : resolve())) };
};
exports.startDecisionServer = startDecisionServer;
