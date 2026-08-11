"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRollbackTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const node_test_1 = require("node:test");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletTopUpRequest_repository_1 = require("../../../repositories/walletTopUpRequest.repository");
const providerEvent_service_1 = __importDefault(require("../../../services/internalProvider/events/providerEvent.service"));
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const processingTopUp = async (currency, amount) => {
    const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
    const dto = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, currency, amount);
    await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, dto.topUpReference);
    await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(dto.topUpReference);
    const request = await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(dto.topUpReference);
    const funding = await internalTopUpFunding_model_1.InternalTopUpFunding.findById(request.providerFundingId)
        .select("+requestFingerprint").orFail();
    return { actors, dto, request, funding };
};
const registerRollbackTests = () => {
    (0, node_test_1.test)("phase10d rollback: request persistence failure leaves only the intentional zero-balance Wallet stage", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const original = walletTopUpRequest_repository_1.walletTopUpRequestRepository.createPending;
        walletTopUpRequest_repository_1.walletTopUpRequestRepository.createPending = async () => {
            throw new Error("PHASE10D_REQUEST_PERSISTENCE_FAILURE");
        };
        try {
            await strict_1.default.rejects(() => (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 300));
        }
        finally {
            walletTopUpRequest_repository_1.walletTopUpRequestRepository.createPending = original;
        }
        const wallet = await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD");
        strict_1.default.deepEqual([wallet.availableBalance, wallet.currentBalance], [0, 0]);
        strict_1.default.equal(await walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({}), 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10d rollback: provider event failure aborts provider authority and preserves APPROVED request", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const request = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "EUR", 425);
        await (0, multiCurrencyTopUpFixtures_1.approveTopUp)(actors, request.topUpReference);
        const original = providerEvent_service_1.default.recordEvent;
        providerEvent_service_1.default.recordEvent = async () => {
            throw new Error("PHASE10D_PROVIDER_EVENT_FAILURE");
        };
        try {
            await strict_1.default.rejects(() => (0, multiCurrencyTopUpFixtures_1.succeedFunding)(request.topUpReference));
        }
        finally {
            providerEvent_service_1.default.recordEvent = original;
        }
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}), 0);
        strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({}), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(request.topUpReference)).status, "APPROVED");
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR")).availableBalance, 0);
        await (0, multiCurrencyTopUpFixtures_1.succeedFunding)(request.topUpReference);
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(request.topUpReference);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR")).availableBalance, 425);
    });
    (0, node_test_1.test)("phase10d rollback: USD Ledger-only interruption resumes without duplicate credit", async () => {
        const fixture = await processingTopUp("USD", 550);
        const staged = await (0, topUpFixtures_1.establishLedgerStage)(fixture.request, fixture.funding);
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(fixture.dto.topUpReference);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            "metadata.topUpReference": fixture.dto.topUpReference,
        }), 1);
        strict_1.default.ok((await ledgerEntry_model_1.LedgerEntry.findOne({
            "metadata.topUpReference": fixture.dto.topUpReference,
        }).orFail())._id.equals(staged.ledger._id));
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            userId: fixture.actors.userId, currency: "USD",
        }), 1);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "USD")).availableBalance, 550);
    });
    (0, node_test_1.test)("phase10d rollback: aborted EUR projection transaction leaves no projection or balance delta", async () => {
        const fixture = await processingTopUp("EUR", 675);
        const { ledger, identity } = await (0, topUpFixtures_1.establishLedgerStage)(fixture.request, fixture.funding);
        const session = await mongoose_1.default.startSession();
        try {
            await strict_1.default.rejects(() => session.withTransaction(async () => {
                await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                    userId: fixture.request.userId,
                    currency: fixture.request.currency,
                    operationKey: identity.operationKey,
                    deltas: { availableBalance: fixture.request.amount },
                    ledgerEntryIds: [ledger._id],
                }, session);
                throw new Error("PHASE10D_ABORT_PROJECTION");
            }));
        }
        finally {
            await session.endSession();
        }
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            operationKey: identity.operationKey,
        }), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "EUR")).availableBalance, 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            "metadata.topUpReference": fixture.dto.topUpReference,
        }), 1, "The prior Ledger stage remains authoritative.");
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(fixture.dto.topUpReference);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "EUR")).availableBalance, 675);
    });
    (0, node_test_1.test)("phase10d rollback: completion-link interruption recovers existing Ledger and projection", async () => {
        const fixture = await processingTopUp("USD", 825);
        const original = walletTopUpRequest_repository_1.walletTopUpRequestRepository.completeProcessingWithAccounting;
        walletTopUpRequest_repository_1.walletTopUpRequestRepository.completeProcessingWithAccounting =
            async () => null;
        try {
            await strict_1.default.rejects(() => (0, multiCurrencyTopUpFixtures_1.completeAccounting)(fixture.dto.topUpReference));
        }
        finally {
            walletTopUpRequest_repository_1.walletTopUpRequestRepository.completeProcessingWithAccounting =
                original;
        }
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(fixture.dto.topUpReference)).status, "PROCESSING");
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            "metadata.topUpReference": fixture.dto.topUpReference,
        }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            userId: fixture.actors.userId, currency: "USD",
        }), 1);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "USD")).availableBalance, 825);
        await (0, multiCurrencyTopUpFixtures_1.completeAccounting)(fixture.dto.topUpReference);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(fixture.dto.topUpReference)).status, "COMPLETED");
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 1);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(fixture.actors.userId, "USD")).availableBalance, 825);
    });
};
exports.registerRollbackTests = registerRollbackTests;
