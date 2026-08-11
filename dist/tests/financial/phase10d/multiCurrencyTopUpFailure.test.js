"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const internalTopUpFundingFailureCode_enum_1 = require("../../../enums/financial/internalTopUpFundingFailureCode.enum");
const walletTopUpDecision_enum_1 = require("../../../enums/financial/walletTopUpDecision.enum");
const walletTopUpRejectionCode_enum_1 = require("../../../enums/financial/walletTopUpRejectionCode.enum");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const adminWalletTopUpDecision_service_1 = require("../../../services/financial/adminWalletTopUpDecision.service");
const topUpFundingOrchestrator_service_1 = require("../../../services/financial/topUpFundingOrchestrator.service");
const walletTopUpProviderFailure_service_1 = require("../../../services/financial/walletTopUpProviderFailure.service");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const registerFailureTests = () => {
    (0, node_test_1.test)("phase10d rejection: rejected USD request has no provider or Wallet effect", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const request = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "USD", 700);
        const rejected = await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({
            adminUserId: actors.adminId.toString(),
            topUpReference: request.topUpReference,
            decision: walletTopUpDecision_enum_1.WalletTopUpDecision.REJECT,
            rejectionCode: walletTopUpRejectionCode_enum_1.WalletTopUpRejectionCode.ADMIN_DECLINED,
            rejectionReason: "Direct USD top-up declined",
        });
        strict_1.default.equal(rejected.status, "REJECTED");
        strict_1.default.equal(rejected.currency, "USD");
        strict_1.default.equal(rejected.amount, 700);
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}), 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.deepEqual([
            (await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "USD")).availableBalance,
            (await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "INR")).availableBalance,
        ], [0, 0]);
    });
    (0, node_test_1.test)("phase10d provider failure: failed EUR funding finalizes with zero credit", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const request = await (0, multiCurrencyTopUpFixtures_1.requestTopUp)(actors, "EUR", 900);
        await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({
            adminUserId: actors.adminId.toString(),
            topUpReference: request.topUpReference,
            decision: walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE,
        });
        const provider = await topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.start({
            topUpReference: request.topUpReference,
            outcome: internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE,
            failureCode: internalTopUpFundingFailureCode_enum_1.InternalTopUpFundingFailureCode.SIMULATED_DECLINE,
            failureReason: "Phase 10D EUR provider failure",
        });
        strict_1.default.equal(provider.currency, "EUR");
        strict_1.default.equal(provider.providerStatus, "FAILED");
        await walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(request.topUpReference, actors.adminId.toString());
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.reloadTopUp)(request.topUpReference)).status, "FAILED");
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "EUR")).availableBalance, 0);
        strict_1.default.equal((await (0, multiCurrencyTopUpFixtures_1.getWallet)(actors.userId, "INR")).availableBalance, 0);
    });
};
exports.registerFailureTests = registerFailureTests;
