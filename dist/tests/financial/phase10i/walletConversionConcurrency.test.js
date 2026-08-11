"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10i concurrency: ten attempts converge on one accounting graph", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        const results = await Promise.all(Array.from({ length: 10 }, () => (0, walletConversionAccountingFixtures_1.account)(fixture)));
        strict_1.default.ok(results.every((result) => result.status === "COMPLETED"));
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+accountingTransactionReference +sourceProjectionReference " +
            "+targetProjectionReference").orFail();
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            transactionId: request.accountingTransactionReference
        }), 2);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            operationReference: { $in: [request.sourceProjectionReference,
                    request.targetProjectionReference] },
        }), 2);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            conversionReference: request.conversionReference,
            action: "WALLET_CONVERSION_COMPLETED",
        }), 1);
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
