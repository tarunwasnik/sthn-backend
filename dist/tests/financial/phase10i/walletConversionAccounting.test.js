"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAccountingTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerAccountingTests = () => {
    (0, node_test_1.test)("phase10i completes cross-currency Ledger and Wallet accounting", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        const sourceBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId)
            .orFail();
        const result = await (0, walletConversionAccountingFixtures_1.account)(fixture);
        strict_1.default.deepEqual(Object.keys(result).sort(), ["completedAt",
            "conversionReference", "sourceAmount", "sourceCurrency", "status",
            "targetAmount", "targetCurrency"].sort());
        strict_1.default.equal(result.status, "COMPLETED");
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+conversionKey +userId +sourceWalletId +targetWalletId " +
            "+accountingKey +accountingFingerprint " +
            "+accountingTransactionReference +accountingTargetWalletId " +
            "+sourceProjectionReference +targetProjectionReference " +
            "+sourceWalletVersion +targetWalletVersion").orFail();
        strict_1.default.equal(request.status, "COMPLETED");
        strict_1.default.match(request.accountingReference, /^WCA-/);
        strict_1.default.match(request.accountingTransactionReference, /^WCAT-/);
        strict_1.default.equal(request.accountingFingerprint?.length, 64);
        const [sourceWallet, targetWallet] = await Promise.all([
            wallet_model_1.Wallet.findById(request.sourceWalletId).orFail(),
            wallet_model_1.Wallet.findById(request.accountingTargetWalletId).orFail(),
        ]);
        strict_1.default.equal(sourceWallet.availableBalance, sourceBefore.availableBalance - request.sourceAmount);
        strict_1.default.equal(targetWallet.availableBalance, request.targetAmount);
        strict_1.default.equal(sourceWallet.currentBalance, sourceWallet.availableBalance);
        strict_1.default.equal(targetWallet.currentBalance, targetWallet.availableBalance);
        strict_1.default.equal(sourceWallet.projectionVersion, 1);
        strict_1.default.equal(targetWallet.projectionVersion, 1);
        const entries = await ledgerEntry_model_1.LedgerEntry.find({
            transactionId: request.accountingTransactionReference,
        }).select("+postingKey").sort({ direction: 1 });
        strict_1.default.equal(entries.length, 2);
        const debit = entries.find((entry) => entry.direction === "DEBIT");
        const credit = entries.find((entry) => entry.direction === "CREDIT");
        strict_1.default.equal(debit.type, "WALLET_CONVERSION_COMPLETED");
        strict_1.default.equal(debit.source, "WALLET_CONVERSION");
        strict_1.default.equal(debit.account, "WALLET_AVAILABLE");
        strict_1.default.equal(debit.amount, request.sourceAmount);
        strict_1.default.equal(debit.currency, request.sourceCurrency);
        strict_1.default.ok(debit.walletId?.equals(sourceWallet._id));
        strict_1.default.equal(credit.amount, request.targetAmount);
        strict_1.default.equal(credit.currency, request.targetCurrency);
        strict_1.default.ok(credit.walletId?.equals(targetWallet._id));
        const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.find({
            operationReference: { $in: [request.sourceProjectionReference,
                    request.targetProjectionReference] },
        });
        strict_1.default.equal(projections.length, 2);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: request.conversionReference,
            action: "WALLET_CONVERSION_COMPLETED",
        }), 1);
    });
    (0, node_test_1.test)("phase10i reuses an existing target Wallet", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)({ createTargetWallet: true });
        const targetBefore = await wallet_model_1.Wallet.findOne({ userId: fixture.request.userId,
            currency: fixture.request.targetCurrency }).orFail();
        const countBefore = await wallet_model_1.Wallet.countDocuments({
            userId: fixture.request.userId, currency: fixture.request.targetCurrency,
        });
        await (0, walletConversionAccountingFixtures_1.account)(fixture);
        const targetAfter = await wallet_model_1.Wallet.findById(targetBefore._id).orFail();
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.request.userId,
            currency: fixture.request.targetCurrency }), countBefore);
        strict_1.default.equal(targetAfter.availableBalance, targetBefore.availableBalance + fixture.request.targetAmount);
    });
};
exports.registerAccountingTests = registerAccountingTests;
