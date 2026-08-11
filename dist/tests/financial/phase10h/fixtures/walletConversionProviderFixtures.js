"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDecisionServer = exports.authToken = exports.executeFailure = exports.executeSuccess = exports.createProviderFixture = exports.captureFrozenFinancialState = exports.PROVIDER_NOW = void 0;
const booking_model_1 = require("../../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../../models/bookingFundReservation.model");
const creatorWithdrawalRequest_model_1 = require("../../../../models/creatorWithdrawalRequest.model");
const exchangeRateSnapshot_model_1 = require("../../../../models/exchangeRateSnapshot.model");
const internalWithdrawalProviderRequest_model_1 = require("../../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const internalTopUpFunding_model_1 = require("../../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../../models/payment.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const walletConversionProviderExecution_service_1 = require("../../../../services/financial/walletConversionProviderExecution.service");
const providerSimulator_service_1 = require("../../../../services/providerSimulator/providerSimulator.service");
const walletConversionDecisionFixtures_1 = require("../../phase10g/fixtures/walletConversionDecisionFixtures");
Object.defineProperty(exports, "authToken", { enumerable: true, get: function () { return walletConversionDecisionFixtures_1.authToken; } });
Object.defineProperty(exports, "startDecisionServer", { enumerable: true, get: function () { return walletConversionDecisionFixtures_1.startDecisionServer; } });
exports.PROVIDER_NOW = new Date("2026-08-02T13:30:00.000Z");
const captureFrozenFinancialState = async () => ({
    counts: await Promise.all([
        wallet_model_1.Wallet.countDocuments({}), ledgerEntry_model_1.LedgerEntry.countDocuments({}),
        walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), booking_model_1.Booking.countDocuments({}),
        payment_model_1.Payment.countDocuments({}), bookingFundReservation_model_1.BookingFundReservation.countDocuments({}),
        bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({}),
        bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({}),
        creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments({}),
        internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({}),
        walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}), internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
    ]),
    wallets: await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(),
    snapshots: await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({}).sort({ _id: 1 })
        .select("+snapshotFingerprint +responseFingerprint").lean(),
});
exports.captureFrozenFinancialState = captureFrozenFinancialState;
const createProviderFixture = async (options) => {
    const decision = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({
        createTargetWallet: options?.createTargetWallet,
    });
    await (0, walletConversionDecisionFixtures_1.approve)(decision);
    let tick = 0;
    let executions = 0;
    const service = new walletConversionProviderExecution_service_1.WalletConversionProviderExecutionService(decision.requestService, {
        now: () => new Date(exports.PROVIDER_NOW.getTime() + tick++),
        failureInjector: options?.failureInjector,
        executor: (input) => {
            executions += 1;
            return providerSimulator_service_1.providerSimulatorService.simulateWalletConversionProvider(input);
        },
    });
    return { ...decision, service, get executions() { return executions; } };
};
exports.createProviderFixture = createProviderFixture;
const executeSuccess = (fixture) => fixture.service.execute({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    outcome: "SUCCESS",
});
exports.executeSuccess = executeSuccess;
const executeFailure = (fixture) => fixture.service.execute({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    outcome: "FAILURE", failureCode: "SIMULATED_CONVERSION_FAILURE",
    failureReason: "Deterministic conversion provider failure",
});
exports.executeFailure = executeFailure;
