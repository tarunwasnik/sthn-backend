"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
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
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const moneyCounts = async () => Promise.all([
    wallet_model_1.Wallet.countDocuments({}),
    walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}),
    ledgerEntry_model_1.LedgerEntry.countDocuments({}),
    walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}),
    internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
    booking_model_1.Booking.countDocuments({}),
    payment_model_1.Payment.countDocuments({}),
    bookingFundReservation_model_1.BookingFundReservation.countDocuments({}),
    bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({}),
    bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({}),
    creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments({}),
    internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({}),
]);
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10e no-money-movement proof changes only snapshots and safe FX audits", async () => {
        const { actors, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const beforeCounts = await moneyCounts();
        const beforeWallets = await wallet_model_1.Wallet.find({ userId: actors.userId }).lean();
        await Promise.all([
            service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("USD", "INR", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("INR", "EUR", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("INR", "JPY", fxRateSnapshotFixtures_1.systemActor),
        ]);
        const afterCounts = await moneyCounts();
        const afterWallets = await wallet_model_1.Wallet.find({ userId: actors.userId }).lean();
        strict_1.default.deepEqual(afterCounts, beforeCounts);
        strict_1.default.deepEqual(afterWallets, beforeWallets);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 4);
        strict_1.default.equal(await fxRateAudit_model_1.FxRateAudit.countDocuments({
            action: "FX_RATE_SNAPSHOT_CREATED",
        }), 4);
        strict_1.default.equal(mongoose_1.default.modelNames().some((name) => /ConversionExecution|ConversionAccounting/i.test(name)), false);
    });
    (0, node_test_1.test)("phase10e indexes enforce immutable identity and one ACTIVE directed-pair authority", async () => {
        const snapshotIndexes = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.indexes();
        const auditIndexes = await fxRateAudit_model_1.FxRateAudit.collection.indexes();
        strict_1.default.ok(snapshotIndexes.some((index) => index.unique &&
            index.key.snapshotReference === 1));
        strict_1.default.ok(snapshotIndexes.some((index) => index.unique &&
            index.key.snapshotKey === 1));
        strict_1.default.ok(snapshotIndexes.some((index) => index.unique &&
            index.key.provider === 1 && index.key.baseCurrency === 1 &&
            index.key.quoteCurrency === 1 && index.key.status === 1 &&
            index.partialFilterExpression?.status === "ACTIVE"));
        strict_1.default.ok(snapshotIndexes.some((index) => index.key.effectiveDate === -1));
        strict_1.default.ok(auditIndexes.some((index) => index.unique &&
            index.key.auditKey === 1));
    });
};
exports.registerRegressionTests = registerRegressionTests;
