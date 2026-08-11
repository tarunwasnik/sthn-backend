"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const WalletTopUpRequestError_1 = require("../../../errors/financial/WalletTopUpRequestError");
const adminWalletTopUpDecision_service_1 = require("../../../services/financial/adminWalletTopUpDecision.service");
const topUpAccountingOrchestrator_service_1 = require("../../../services/financial/topUpAccountingOrchestrator.service");
const topUpFundingOrchestrator_service_1 = require("../../../services/financial/topUpFundingOrchestrator.service");
const walletTopUpRequest_service_1 = require("../../../services/financial/walletTopUpRequest.service");
const walletCreation_service_1 = require("../../../services/wallet/walletCreation.service");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const walletTopUpDecision_enum_1 = require("../../../enums/financial/walletTopUpDecision.enum");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10d replay: Wallet and cross-currency key replay are currency-bound", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const wallets = await Promise.all([
            walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD"),
            walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD"),
        ]);
        strict_1.default.equal(wallets[0]._id.toString(), wallets[1]._id.toString());
        const key = "phase10d-cross-currency-key";
        const first = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 100, key);
        const replay = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 100, key);
        strict_1.default.equal(replay.topUpReference, first.topUpReference);
        await strict_1.default.rejects(() => (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "EUR", 100, key), (error) => error instanceof WalletTopUpRequestError_1.WalletTopUpRequestError &&
            error.code === "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT");
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
            userId: actors.userId, currency: "EUR",
        }), 0, "Conflicting replay must not create another currency Wallet.");
    });
    (0, node_test_1.test)("phase10d replay: approval, provider, accounting, completion, and service reload preserve one effect", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const request = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 2500);
        const approval = {
            adminUserId: actors.adminId.toString(),
            topUpReference: request.topUpReference,
            decision: walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE,
        };
        const firstApproval = await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide(approval);
        const replayApproval = await new adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.constructor()
            .decide(approval);
        strict_1.default.equal(firstApproval.decidedAt?.getTime(), replayApproval.decidedAt?.getTime());
        const fundingInput = {
            topUpReference: request.topUpReference,
            outcome: internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS,
        };
        const firstFunding = await topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.start(fundingInput);
        const replayFunding = await new topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.constructor()
            .start(fundingInput);
        strict_1.default.equal(firstFunding.providerFundingReference, replayFunding.providerFundingReference);
        const firstAccounting = await topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(request.topUpReference);
        const replayAccounting = await new topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.constructor().complete(request.topUpReference);
        strict_1.default.deepEqual({
            ledger: replayAccounting.ledgerReference,
            projection: replayAccounting.projectionOperationReference,
            transaction: replayAccounting.transactionId,
            completedAt: replayAccounting.completedAt.getTime(),
        }, {
            ledger: firstAccounting.ledgerReference,
            projection: firstAccounting.projectionOperationReference,
            transaction: firstAccounting.transactionId,
            completedAt: firstAccounting.completedAt.getTime(),
        });
        const [requests, fundings, events, ledgers, projections, wallet] = await Promise.all([
            walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({ topUpReference: request.topUpReference }),
            internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({ topUpReference: request.topUpReference }),
            internalProviderEvent_model_1.default.countDocuments({
                providerEntityId: firstFunding.providerFundingReference,
            }),
            ledgerEntry_model_1.LedgerEntry.countDocuments({
                "metadata.topUpReference": request.topUpReference,
            }),
            walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ userId: actors.userId }),
            wallet_model_1.Wallet.findOne({ userId: actors.userId, currency: "USD" }).orFail(),
        ]);
        strict_1.default.deepEqual([requests, fundings, events, ledgers, projections], [1, 1, 3, 1, 1]);
        strict_1.default.deepEqual([wallet.availableBalance, wallet.currentBalance], [2500, 2500]);
        strict_1.default.equal(await walletTopUpRequest_service_1.walletTopUpRequestService.getOwn(actors.userId.toString(), request.topUpReference).then((item) => item.status), "COMPLETED");
    });
};
exports.registerReplayTests = registerReplayTests;
