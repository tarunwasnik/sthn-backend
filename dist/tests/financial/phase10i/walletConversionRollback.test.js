"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRollbackTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerRollbackTests = () => {
    for (const stage of ["AFTER_WALLET_CREATION", "AFTER_LEDGER",
        "AFTER_SOURCE_PROJECTION", "AFTER_TARGET_PROJECTION", "BEFORE_COMPLETED",
        "BEFORE_AUDIT", "BEFORE_COMMIT"]) {
        (0, node_test_1.test)(`phase10i rollback: ${stage} rolls back the accounting transaction`, async () => {
            const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)({
                failureInjector: (point) => {
                    if (point === stage)
                        throw new Error(`Injected ${stage}`);
                },
            });
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean().orFail();
            await strict_1.default.rejects(() => (0, walletConversionAccountingFixtures_1.account)(fixture));
            const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
                conversionReference: fixture.created.conversionReference,
            }).select("+userId +sourceWalletId +accountingTransactionReference")
                .orFail();
            strict_1.default.equal(request.status, "APPROVED");
            strict_1.default.equal(request.providerStatus, "SUCCEEDED");
            strict_1.default.equal(request.accountingReference, undefined);
            strict_1.default.equal(request.accountingTransactionReference, undefined);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: request.userId,
                currency: request.targetCurrency }), 0);
            strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(request.sourceWalletId).lean(), walletBefore);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                "metadata.conversionReference": request.conversionReference
            }), 0);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
            strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
                conversionReference: request.conversionReference,
                action: "WALLET_CONVERSION_COMPLETED",
            }), 0);
        });
    }
};
exports.registerRollbackTests = registerRollbackTests;
