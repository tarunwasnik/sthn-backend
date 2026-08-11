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
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase7h concurrency: 10 same-top-up calls converge to one Ledger and projection", { timeout: 60000 }, async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 1250);
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference)));
        const rejected = settled
            .filter((item) => item.status === "rejected")
            .map((item) => item.reason instanceof Error
            ? { name: item.reason.name, message: item.reason.message, code: item.reason.code }
            : item.reason);
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10, JSON.stringify(rejected));
        const [ledgers, operations, wallet, completed] = await Promise.all([
            ledgerEntry_model_1.LedgerEntry.find({ "metadata.topUpReference": request.topUpReference }),
            walletProjectionOperation_model_1.WalletProjectionOperation.find({ walletId: actors.wallet._id }),
            wallet_model_1.Wallet.findById(actors.wallet._id),
            (0, topUpFixtures_1.reloadRequest)(request.topUpReference),
        ]);
        strict_1.default.equal(ledgers.length, 1, "Ledger duplicate race created more than one credit.");
        strict_1.default.equal(operations.length, 1, "Projection duplicate race created more than one operation.");
        strict_1.default.equal(wallet?.availableBalance, 1250);
        strict_1.default.ok(completed.accountingTransactionId);
        strict_1.default.ok(completed.completedAt);
        const results = settled
            .filter((item) => item.status === "fulfilled")
            .map((item) => item.value);
        strict_1.default.equal(new Set(results.map((item) => item.ledgerReference)).size, 1);
        strict_1.default.equal(new Set(results.map((item) => item.projectionOperationReference)).size, 1);
        strict_1.default.equal(new Set(results.map((item) => item.transactionId)).size, 1);
        strict_1.default.equal(new Set(results.map((item) => item.completedAt.getTime())).size, 1);
    });
    (0, node_test_1.test)("phase7h concurrency: independent top-ups 1000, 2500, and 400 have no lost update", { timeout: 60000 }, async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const funded = await Promise.all([
            (0, topUpFixtures_1.createFundedTopUp)(actors, 1000),
            (0, topUpFixtures_1.createFundedTopUp)(actors, 2500),
            (0, topUpFixtures_1.createFundedTopUp)(actors, 400),
        ]);
        const results = await Promise.all(funded.map(({ request }) => (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference)));
        const [wallet, ledgerCount, projectionCount] = await Promise.all([
            wallet_model_1.Wallet.findById(actors.wallet._id),
            ledgerEntry_model_1.LedgerEntry.countDocuments({ userId: actors.userId, type: "WALLET_TOP_UP" }),
            walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }),
        ]);
        strict_1.default.equal(wallet?.availableBalance, 3900);
        strict_1.default.equal(ledgerCount, 3);
        strict_1.default.equal(projectionCount, 3);
        strict_1.default.equal(new Set(results.map((item) => item.transactionId)).size, 3);
        strict_1.default.equal(new Set(results.map((item) => item.ledgerReference)).size, 3);
        strict_1.default.equal(new Set(results.map((item) => item.projectionOperationReference)).size, 3);
        for (const { request } of funded)
            strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(request.topUpReference)).status, "COMPLETED");
    });
    (0, node_test_1.test)("phase7h completion guard race reuses existing effects and winner timestamp", { timeout: 60000 }, async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 600);
        await (0, topUpFixtures_1.establishProjectionStage)(request, funding);
        const before = await wallet_model_1.Wallet.findById(actors.wallet._id);
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference)));
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
        const after = await wallet_model_1.Wallet.findById(actors.wallet._id);
        const completed = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        strict_1.default.equal(before?.availableBalance, 600);
        strict_1.default.equal(after?.availableBalance, 600);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
        strict_1.default.ok(completed.completedAt);
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
