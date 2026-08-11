"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerFailureTests = () => {
    (0, node_test_1.test)("phase10i provider failure finalizes FAILED without accounting", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)({ providerOutcome: "FAILURE" });
        const walletsBefore = await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean();
        const result = await (0, walletConversionAccountingFixtures_1.account)(fixture);
        strict_1.default.equal(result.status, "FAILED");
        strict_1.default.equal(result.completedAt, undefined);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+accountingTransactionReference +accountingTargetWalletId " +
            "+sourceProjectionReference +targetProjectionReference").orFail();
        strict_1.default.equal(request.status, "FAILED");
        strict_1.default.ok(request.failedAt);
        strict_1.default.equal(request.accountingReference, undefined);
        strict_1.default.equal(request.accountingTransactionReference, undefined);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            "metadata.conversionReference": request.conversionReference
        }), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(), walletsBefore);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: request.conversionReference,
            action: "WALLET_CONVERSION_FAILED",
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionAccountingFixtures_1.account)(fixture), result);
    });
};
exports.registerFailureTests = registerFailureTests;
