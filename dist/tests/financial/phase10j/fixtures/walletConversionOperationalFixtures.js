"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureFinancialState = exports.removeLedgerReference = exports.removeCompletionAudit = exports.makeReplayRequired = exports.createHealthyOperationalFixture = exports.OPERATIONAL_ADMIN = void 0;
const mongoose_1 = require("mongoose");
const exchangeRateSnapshot_model_1 = require("../../../../models/exchangeRateSnapshot.model");
const internalWalletConversionProviderRequest_model_1 = require("../../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const walletConversionReconciliation_service_1 = require("../../../../services/financial/walletConversionReconciliation.service");
const walletConversionAccountingFixtures_1 = require("../../phase10i/fixtures/walletConversionAccountingFixtures");
exports.OPERATIONAL_ADMIN = new mongoose_1.Types.ObjectId();
const createHealthyOperationalFixture = async (options) => {
    const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
    await (0, walletConversionAccountingFixtures_1.account)(fixture);
    const service = new walletConversionReconciliation_service_1.WalletConversionReconciliationService({
        now: () => new Date("2026-08-05T10:00:00.000Z"),
        failureInjector: options?.failureInjector,
    });
    return { ...fixture, service, adminId: exports.OPERATIONAL_ADMIN.toString(),
        conversionReference: fixture.created.conversionReference };
};
exports.createHealthyOperationalFixture = createHealthyOperationalFixture;
const makeReplayRequired = async (conversionReference) => {
    await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ conversionReference }, { $set: { status: "APPROVED" } });
};
exports.makeReplayRequired = makeReplayRequired;
const removeCompletionAudit = (conversionReference) => walletConversionAudit_model_1.WalletConversionAudit.deleteOne({ conversionReference,
    action: "WALLET_CONVERSION_COMPLETED" });
exports.removeCompletionAudit = removeCompletionAudit;
const removeLedgerReference = (conversionReference) => walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ conversionReference }, { $unset: { accountingTransactionReference: "" } });
exports.removeLedgerReference = removeLedgerReference;
const captureFinancialState = async (conversionReference) => ({
    wallets: await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(),
    ledger: await ledgerEntry_model_1.LedgerEntry.find({}).sort({ _id: 1 }).lean(),
    projections: await walletProjectionOperation_model_1.WalletProjectionOperation.find({}).sort({ _id: 1 })
        .select("+fingerprint").lean(),
    snapshots: await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({}).sort({ _id: 1 })
        .select("+snapshotFingerprint +responseFingerprint").lean(),
    provider: await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.find({
        conversionReference,
    }).select("+providerFingerprint +executionFingerprint +userId " +
        "+sourceWalletId +targetWalletId +providerMetadata +execution +payloads")
        .lean(),
});
exports.captureFinancialState = captureFinancialState;
