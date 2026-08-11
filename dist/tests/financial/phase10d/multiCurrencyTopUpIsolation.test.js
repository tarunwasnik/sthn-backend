"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIsolationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const topUpAccountingOrchestrator_service_1 = require("../../../services/financial/topUpAccountingOrchestrator.service");
const walletCreation_service_1 = require("../../../services/wallet/walletCreation.service");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const processingUsd = async () => {
    const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
    const dto = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 600);
    await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, dto.topUpReference);
    await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(dto.topUpReference);
    const request = await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(dto.topUpReference);
    const funding = await internalTopUpFunding_model_1.InternalTopUpFunding.findById(request.providerFundingId)
        .select("+requestFingerprint").orFail();
    return { actors, dto, request, funding };
};
const assertNoAccountingEffect = async (actors) => {
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
    const usd = await wallet_model_1.Wallet.findOne({
        userId: actors.userId, currency: "USD",
    });
    strict_1.default.equal(usd?.availableBalance ?? 0, 0);
};
const registerIsolationTests = () => {
    (0, node_test_1.test)("phase10d integrity: request-to-Wallet currency and ownership mismatches fail closed", async () => {
        const { actors, dto, request } = await processingUsd();
        const eurWallet = await walletCreation_service_1.walletCreationService.createWallet(actors.userId, "EUR");
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: request._id }, { $set: { walletId: eurWallet._id } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(dto.topUpReference));
        await assertNoAccountingEffect(actors);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: request._id }, { $set: { walletId: request.walletId } });
        await wallet_model_1.Wallet.collection.updateOne({ _id: request.walletId }, { $set: { userId: new mongoose_1.Types.ObjectId() } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(dto.topUpReference));
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10d integrity: provider currency or amount mismatch fails before accounting", async () => {
        const currencyCase = await processingUsd();
        await internalTopUpFunding_model_1.InternalTopUpFunding.collection.updateOne({ _id: currencyCase.funding._id }, { $set: { currency: "EUR" } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(currencyCase.dto.topUpReference));
        await assertNoAccountingEffect(currencyCase.actors);
    });
    (0, node_test_1.test)("phase10d integrity: provider amount mismatch fails before accounting", async () => {
        const amountCase = await processingUsd();
        await internalTopUpFunding_model_1.InternalTopUpFunding.collection.updateOne({ _id: amountCase.funding._id }, { $set: { amount: 601 } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(amountCase.dto.topUpReference));
        await assertNoAccountingEffect(amountCase.actors);
    });
    (0, node_test_1.test)("phase10d integrity: Ledger currency and amount mismatches cannot project", async () => {
        const currencyCase = await processingUsd();
        const currencyLedger = await (0, topUpFixtures_1.establishLedgerStage)(currencyCase.request, currencyCase.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: currencyLedger.ledger._id }, { $set: { currency: "EUR" } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(currencyCase.dto.topUpReference));
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(currencyCase.actors.userId, "USD")).availableBalance, 0);
    });
    (0, node_test_1.test)("phase10d integrity: Ledger amount mismatch cannot project", async () => {
        const amountCase = await processingUsd();
        const amountLedger = await (0, topUpFixtures_1.establishLedgerStage)(amountCase.request, amountCase.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: amountLedger.ledger._id }, { $set: { amount: 601 } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(amountCase.dto.topUpReference));
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(amountCase.actors.userId, "USD")).availableBalance, 0);
    });
    (0, node_test_1.test)("phase10d integrity: projection currency corruption blocks completion without cross-currency mutation", async () => {
        const fixture = await processingUsd();
        const stage = await (0, topUpFixtures_1.establishProjectionStage)(fixture.request, fixture.funding);
        await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: stage.operation._id }, { $set: { currency: "EUR" } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(fixture.dto.topUpReference));
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "USD")).availableBalance, 600);
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
            userId: fixture.actors.userId, currency: "EUR",
        }), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(fixture.dto.topUpReference)).status, "PROCESSING");
    });
    (0, node_test_1.test)("phase10d integrity: completed USD request cannot link to EUR projection", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const [usd, eur] = await Promise.all([
            (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(actors, "USD", 300),
            (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(actors, "EUR", 450),
        ]);
        const eurRequest = await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(eur.request.topUpReference);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ topUpReference: usd.request.topUpReference }, { $set: {
                walletProjectionOperationId: eurRequest.walletProjectionOperationId,
                walletProjectionOperationReference: eurRequest.walletProjectionOperationReference,
            } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(usd.request.topUpReference));
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD")).availableBalance, 300);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR")).availableBalance, 450);
    });
    (0, node_test_1.test)("phase10d integrity: conflicting deterministic accounting identity fails replay", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const completed = await (0, multiCurrencyTopUpFixtures_1.completeDirectTopUp)(actors, "USD", 725);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ topUpReference: completed.request.topUpReference }, { $set: { accountingTransactionId: "TUA-CROSS-CURRENCY-CONFLICT" } });
        await strict_1.default.rejects(() => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(completed.request.topUpReference));
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 1);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD")).availableBalance, 725);
    });
};
exports.registerIsolationTests = registerIsolationTests;
