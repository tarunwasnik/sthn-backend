"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletCreation_service_1 = require("../../../services/wallet/walletCreation.service");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const fulfilled = (results) => results.filter((result) => result.status === "fulfilled").length;
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10d concurrency: ten USD Wallet creations converge on one Wallet", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD")));
        strict_1.default.equal(fulfilled(settled), 10);
        const ids = settled
            .filter((item) => item.status === "fulfilled")
            .map((item) => item.value._id.toString());
        strict_1.default.equal(new Set(ids).size, 1);
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
            userId: actors.userId, currency: "USD",
        }), 1);
    });
    (0, node_test_1.test)("phase10d concurrency: ten identical USD accounting calls converge", { timeout: 60000 }, async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const request = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 1250);
        await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, request.topUpReference);
        await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(request.topUpReference);
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, multiCurrencyTopUpFixtures_1.completeAccounting)(request.topUpReference)));
        strict_1.default.equal(fulfilled(settled), 10);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            "metadata.topUpReference": request.topUpReference,
        }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            userId: actors.userId, currency: "USD",
        }), 1);
        const wallet = await wallet_model_1.Wallet.findOne({
            userId: actors.userId, currency: "USD",
        }).orFail();
        strict_1.default.equal(wallet.availableBalance, 1250);
    });
    (0, node_test_1.test)("phase10d concurrency: INR, USD, and EUR top-ups remain independent", { timeout: 60000 }, async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const intents = [
            ["INR", 1000], ["USD", 2000], ["EUR", 3000],
        ];
        const settled = await Promise.allSettled(intents.map(([currency, amount]) => (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(actors, currency, amount)));
        strict_1.default.equal(fulfilled(settled), 3);
        const wallets = await wallet_model_1.Wallet.find({ userId: actors.userId })
            .sort({ currency: 1 });
        strict_1.default.deepEqual(wallets.map((wallet) => [
            wallet.currency, wallet.availableBalance, wallet.currentBalance,
        ]), [
            ["EUR", 3000, 3000],
            ["INR", 1000, 1000],
            ["USD", 2000, 2000],
        ]);
        const ledgers = await ledgerEntry_model_1.LedgerEntry.find({
            userId: actors.userId, type: "WALLET_TOP_UP",
        });
        const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.find({
            userId: actors.userId,
        });
        strict_1.default.equal(ledgers.length, 3);
        strict_1.default.equal(projections.length, 3);
        for (const [currency, amount] of intents) {
            strict_1.default.equal(ledgers.filter((entry) => entry.currency === currency && entry.amount === amount).length, 1);
            const wallet = wallets.find((item) => item.currency === currency);
            strict_1.default.equal(projections.filter((operation) => operation.currency === currency && operation.walletId.equals(wallet._id) &&
                operation.deltas.availableBalance === amount).length, 1);
        }
    });
    (0, node_test_1.test)("phase10d concurrency: independent USD top-ups have no lost update", { timeout: 60000 }, async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const amounts = [1000, 2500, 400, 75];
        const requests = await Promise.all(amounts.map((amount) => (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", amount)));
        await Promise.all(requests.map((request) => (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, request.topUpReference)));
        await Promise.all(requests.map((request) => (0, multiCurrencyTopUpFixtures_1.succeedFunding)(request.topUpReference)));
        const settled = await Promise.allSettled(requests.map((request) => (0, multiCurrencyTopUpFixtures_1.completeAccounting)(request.topUpReference)));
        strict_1.default.equal(fulfilled(settled), amounts.length);
        const wallet = await wallet_model_1.Wallet.findOne({
            userId: actors.userId, currency: "USD",
        }).orFail();
        strict_1.default.equal(wallet.availableBalance, 3975);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            userId: actors.userId, currency: "USD", type: "WALLET_TOP_UP",
        }), amounts.length);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            userId: actors.userId, currency: "USD",
        }), amounts.length);
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
