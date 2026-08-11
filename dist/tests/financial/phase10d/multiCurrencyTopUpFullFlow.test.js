"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const registerFullFlowTests = () => {
    (0, node_test_1.test)("phase10d full flow: USD and EUR direct top-ups preserve the funded currency end to end", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)(100000);
        const usd = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 10000);
        const eur = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "EUR", 5000);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(usd.topUpReference)).status, "PENDING");
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(eur.topUpReference)).status, "PENDING");
        strict_1.default.deepEqual([(await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD")).availableBalance,
            (await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR")).availableBalance], [0, 0]);
        await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, usd.topUpReference);
        await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, eur.topUpReference);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(usd.topUpReference)).status, "APPROVED");
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(eur.topUpReference)).status, "APPROVED");
        const usdFunding = await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(usd.topUpReference);
        const eurFunding = await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(eur.topUpReference);
        strict_1.default.deepEqual([usdFunding.providerStatus, eurFunding.providerStatus], ["SUCCEEDED", "SUCCEEDED"]);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(usd.topUpReference)).status, "PROCESSING");
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(eur.topUpReference)).status, "PROCESSING");
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(usd.topUpReference);
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(eur.topUpReference);
        const [inrWallet, usdWallet, eurWallet, usdRequest, eurRequest] = await Promise.all([
            (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "INR"),
            (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD"),
            (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR"),
            (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(usd.topUpReference),
            (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(eur.topUpReference),
        ]);
        strict_1.default.deepEqual([inrWallet.availableBalance, inrWallet.currentBalance], [100000, 100000]);
        strict_1.default.deepEqual([usdWallet.availableBalance, usdWallet.currentBalance], [10000, 10000]);
        strict_1.default.deepEqual([eurWallet.availableBalance, eurWallet.currentBalance], [5000, 5000]);
        strict_1.default.deepEqual([usdRequest.status, eurRequest.status], ["COMPLETED", "COMPLETED"]);
        strict_1.default.ok(usdRequest.completedAt && eurRequest.completedAt);
        strict_1.default.ok(usdRequest.walletProjectionOperationId);
        strict_1.default.ok(eurRequest.walletProjectionOperationId);
        const ledgers = await ledgerEntry_model_1.LedgerEntry.find({
            "metadata.topUpReference": {
                $in: [usd.topUpReference, eur.topUpReference],
            },
        }).sort({ currency: 1 });
        strict_1.default.deepEqual(ledgers.map((entry) => [entry.currency, entry.amount, entry.type, entry.source]), [
            ["EUR", 5000, "WALLET_TOP_UP", "INTERNAL_TOP_UP_FUNDING"],
            ["USD", 10000, "WALLET_TOP_UP", "INTERNAL_TOP_UP_FUNDING"],
        ]);
        const operations = await walletProjectionOperation_model_1.WalletProjectionOperation.find({
            _id: { $in: [
                    usdRequest.walletProjectionOperationId,
                    eurRequest.walletProjectionOperationId,
                ] },
        }).sort({ currency: 1 });
        strict_1.default.equal(operations.length, 2);
        strict_1.default.deepEqual(operations.map((operation) => [
            operation.currency,
            operation.deltas.availableBalance,
            operation.deltas.reservedBalance,
            operation.deltas.lockedBalance,
        ]), [
            ["EUR", 5000, 0, 0],
            ["USD", 10000, 0, 0],
        ]);
        strict_1.default.ok(operations.find((item) => item.currency === "USD")
            ?.walletId.equals(usdWallet._id));
        strict_1.default.ok(operations.find((item) => item.currency === "EUR")
            ?.walletId.equals(eurWallet._id));
        for (const request of [usdRequest, eurRequest]) {
            const events = await internalProviderEvent_model_1.default.find({
                entityId: request.providerFundingId,
            }).sort({ occurredAt: 1 });
            strict_1.default.deepEqual(events.map((event) => event.eventType), [
                "TOP_UP_FUNDING_CREATED",
                "TOP_UP_FUNDING_PROCESSING_STARTED",
                "TOP_UP_FUNDING_SUCCEEDED",
            ]);
            strict_1.default.equal(new Set(events.map((event) => event.transitionKey)).size, 3);
        }
        strict_1.default.equal(mongoose_1.default.modelNames().some((name) => /ConversionExecution|ConversionAccounting|ConversionProvider/i.test(name)), false);
    });
};
exports.registerFullFlowTests = registerFullFlowTests;
