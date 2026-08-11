"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uniqueKey = exports.captureUnrelatedFinancialState = exports.account = exports.createAccountingFixture = exports.ACCOUNTING_NOW = void 0;
const mongoose_1 = require("mongoose");
const booking_model_1 = require("../../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../../models/bookingFundReservation.model");
const creatorWithdrawalRequest_model_1 = require("../../../../models/creatorWithdrawalRequest.model");
const exchangeRateSnapshot_model_1 = require("../../../../models/exchangeRateSnapshot.model");
const internalTopUpFunding_model_1 = require("../../../../models/internalTopUpFunding.model");
const payment_model_1 = require("../../../../models/payment.model");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const walletConversionRequest_model_1 = require("../../../../models/walletConversionRequest.model");
const walletConversionAccounting_service_1 = require("../../../../services/financial/walletConversionAccounting.service");
const walletConversionProviderFixtures_1 = require("../../phase10h/fixtures/walletConversionProviderFixtures");
exports.ACCOUNTING_NOW = new Date("2026-08-03T12:00:00.000Z");
const createAccountingFixture = async (options) => {
    const providerFixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)({
        createTargetWallet: options?.createTargetWallet,
    });
    if (options?.providerOutcome === "FAILURE") {
        await (0, walletConversionProviderFixtures_1.executeFailure)(providerFixture);
    }
    else {
        await (0, walletConversionProviderFixtures_1.executeSuccess)(providerFixture);
    }
    let tick = 0;
    const service = new walletConversionAccounting_service_1.WalletConversionAccountingService({
        now: () => new Date(exports.ACCOUNTING_NOW.getTime() + tick++),
        failureInjector: options?.failureInjector,
    });
    const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
        conversionReference: providerFixture.created.conversionReference,
    }).select("+conversionKey +userId +sourceWalletId +targetWalletId " +
        "+fxSnapshotId +rateValue +rateScale +inverseRateValue " +
        "+inverseRateScale +sourceMinorUnits +targetMinorUnits " +
        "+idempotencyKey +requestFingerprint +decidedBy +providerMetadata")
        .orFail();
    return { ...providerFixture, service, request };
};
exports.createAccountingFixture = createAccountingFixture;
const account = (fixture) => fixture.service.account(fixture.created.conversionReference);
exports.account = account;
const captureUnrelatedFinancialState = async () => ({
    snapshots: await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({}).sort({ _id: 1 })
        .select("+snapshotFingerprint +responseFingerprint").lean(),
    counts: await Promise.all([
        booking_model_1.Booking.countDocuments({}), payment_model_1.Payment.countDocuments({}),
        bookingFundReservation_model_1.BookingFundReservation.countDocuments({}),
        bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({}),
        bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({}),
        creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments({}),
        walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}),
        internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
    ]),
});
exports.captureUnrelatedFinancialState = captureUnrelatedFinancialState;
const uniqueKey = (prefix) => `${prefix}-${new mongoose_1.Types.ObjectId().toString()}`;
exports.uniqueKey = uniqueKey;
