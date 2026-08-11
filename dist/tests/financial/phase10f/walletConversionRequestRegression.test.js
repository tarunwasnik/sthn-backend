"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const frozenCounts = () => Promise.all([
    wallet_model_1.Wallet.countDocuments({}), ledgerEntry_model_1.LedgerEntry.countDocuments({}),
    walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), booking_model_1.Booking.countDocuments({}),
    payment_model_1.Payment.countDocuments({}), bookingFundReservation_model_1.BookingFundReservation.countDocuments({}),
    bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({}),
    bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({}),
    creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments({}),
    internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({}),
    walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}), internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
]);
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10f no-money-movement proof changes only request and safe audit", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const beforeCounts = await frozenCounts();
        const beforeWallets = await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean();
        const beforeSnapshots = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({})
            .sort({ snapshotReference: 1 }).select("+snapshotFingerprint").lean();
        const providerCalls = fixture.provider.callCount;
        await fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-no-money"));
        strict_1.default.deepEqual(await frozenCounts(), beforeCounts);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(), beforeWallets);
        strict_1.default.deepEqual(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({})
            .sort({ snapshotReference: 1 }).select("+snapshotFingerprint").lean(), beforeSnapshots);
        strict_1.default.equal(fixture.provider.callCount, providerCalls);
        strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 1);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}), 1);
    });
    (0, node_test_1.test)("phase10f indexes enforce request, idempotency, listing, and snapshot identities", async () => {
        const requestIndexes = await walletConversionRequest_model_1.WalletConversionRequest.collection.indexes();
        const auditIndexes = await walletConversionAudit_model_1.WalletConversionAudit.collection.indexes();
        strict_1.default.ok(requestIndexes.some((index) => index.unique &&
            index.key.conversionReference === 1));
        strict_1.default.ok(requestIndexes.some((index) => index.unique &&
            index.key.conversionKey === 1));
        strict_1.default.ok(requestIndexes.some((index) => index.unique &&
            index.key.userId === 1 && index.key.idempotencyKey === 1));
        strict_1.default.ok(requestIndexes.some((index) => index.key.userId === 1 &&
            index.key.requestedAt === -1));
        strict_1.default.ok(requestIndexes.some((index) => index.key.fxSnapshotReference === 1));
        strict_1.default.ok(auditIndexes.some((index) => index.unique &&
            index.key.auditKey === 1));
    });
};
exports.registerRegressionTests = registerRegressionTests;
