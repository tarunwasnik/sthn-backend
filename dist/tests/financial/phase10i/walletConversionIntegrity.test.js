"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccounting_service_1 = require("../../../services/financial/walletConversionAccounting.service");
const walletConversionDecisionFixtures_1 = require("../phase10g/fixtures/walletConversionDecisionFixtures");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const code = (expected) => (error) => error.code === expected;
const registerIntegrityTests = () => {
    (0, node_test_1.test)("phase10i permits only provider-terminal approved requests", async () => {
        const pending = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await strict_1.default.rejects(() => new walletConversionAccounting_service_1.WalletConversionAccountingService().account(pending.created.conversionReference), code("WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS"));
    });
    (0, node_test_1.test)("phase10i rejects insufficient source Wallet balance atomically", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        await wallet_model_1.Wallet.updateOne({ _id: fixture.request.sourceWalletId }, { $set: {
                availableBalance: fixture.request.sourceAmount - 1,
                currentBalance: fixture.request.sourceAmount - 1,
            } });
        await strict_1.default.rejects(() => (0, walletConversionAccountingFixtures_1.account)(fixture), code("WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE"));
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            type: "WALLET_CONVERSION_COMPLETED"
        }), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10i rejects corrupted provider identity", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.collection.updateOne({
            conversionReference: fixture.created.conversionReference,
        }, { $inc: { sourceAmount: 1 } });
        await strict_1.default.rejects(() => (0, walletConversionAccountingFixtures_1.account)(fixture), code("WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT"));
    });
    (0, node_test_1.test)("phase10i replay rejects missing Ledger and corrupted Wallet", async () => {
        const first = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        await (0, walletConversionAccountingFixtures_1.account)(first);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: first.created.conversionReference,
        }).select("+accountingTransactionReference").orFail();
        await ledgerEntry_model_1.LedgerEntry.deleteOne({
            transactionId: request.accountingTransactionReference,
            direction: "DEBIT",
        });
        await strict_1.default.rejects(() => (0, walletConversionAccountingFixtures_1.account)(first), code("WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT"));
        const second = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        await (0, walletConversionAccountingFixtures_1.account)(second);
        const completed = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: second.created.conversionReference,
        }).select("+accountingTargetWalletId").orFail();
        await wallet_model_1.Wallet.collection.updateOne({ _id: completed.accountingTargetWalletId }, { $inc: { currentBalance: 1 } });
        await strict_1.default.rejects(() => (0, walletConversionAccountingFixtures_1.account)(second), code("WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT"));
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
