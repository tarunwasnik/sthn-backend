"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const financialLimits_1 = require("../../../constants/financial/financialLimits");
const WalletTopUpRequestError_1 = require("../../../errors/financial/WalletTopUpRequestError");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletTopUpRequest_service_1 = require("../../../services/financial/walletTopUpRequest.service");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10d minor units: USD minimum, JPY zero-decimal amount, and maximum bound remain integer units", async () => {
        const minimumActors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(minimumActors, "USD", 1);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(minimumActors.userId, "USD")).availableBalance, 1);
        const jpyActors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(jpyActors, "JPY", 5000);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(jpyActors.userId, "JPY")).availableBalance, 5000);
        const maximumActors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(maximumActors, "EUR", financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(maximumActors.userId, "EUR")).availableBalance, financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT);
    });
    (0, node_test_1.test)("phase10d minor units: fractional, unsafe, over-limit, and unsupported inputs fail before persistence", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        for (const amount of [
            1.5,
            Number.MAX_SAFE_INTEGER,
            financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT + 1,
        ]) {
            await strict_1.default.rejects(() => walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), { currency: "USD", amount, idempotencyKey: `invalid-${amount}` }), (error) => error instanceof WalletTopUpRequestError_1.WalletTopUpRequestError &&
                error.code === "WALLET_TOP_UP_REQUEST_INVALID_AMOUNT");
        }
        await strict_1.default.rejects(() => walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), { currency: "XYZ", amount: 100, idempotencyKey: "unsupported-xyz" }), (error) => error instanceof WalletTopUpRequestError_1.WalletTopUpRequestError &&
            error.code === "WALLET_TOP_UP_REQUEST_UNSUPPORTED_CURRENCY");
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
            userId: actors.userId, currency: { $ne: "INR" },
        }), 0);
        strict_1.default.equal(await walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10d regression: INR direct top-up remains unchanged", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const completed = await (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(actors, "INR", 4200);
        strict_1.default.equal(completed.accounting.currency, "INR");
        strict_1.default.equal(completed.accounting.wallet.currency, "INR");
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "INR")).availableBalance, 4200);
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: actors.userId }), 1);
    });
    (0, node_test_1.test)("phase10d indexes: Wallet, request, provider, Ledger, and projection identities remain unique", async () => {
        const indexes = await Promise.all([
            wallet_model_1.Wallet.collection.indexes(),
            walletTopUpRequest_model_1.WalletTopUpRequest.collection.indexes(),
            internalTopUpFunding_model_1.InternalTopUpFunding.collection.indexes(),
            ledgerEntry_model_1.LedgerEntry.collection.indexes(),
            walletProjectionOperation_model_1.WalletProjectionOperation.collection.indexes(),
        ]);
        strict_1.default.ok(indexes[0].some((index) => index.unique &&
            index.key.userId === 1 && index.key.currency === 1));
        strict_1.default.ok(indexes[1].some((index) => index.unique &&
            index.key.userId === 1 && index.key.idempotencyKey === 1));
        strict_1.default.ok(indexes[2].some((index) => index.unique &&
            index.key.topUpRequestId === 1));
        strict_1.default.ok(indexes[3].some((index) => index.unique &&
            index.key.postingKey === 1));
        strict_1.default.ok(indexes[4].some((index) => index.unique &&
            index.key.operationKey === 1));
    });
};
exports.registerRegressionTests = registerRegressionTests;
