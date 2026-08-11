"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProviderFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const wallet_model_1 = require("../../../models/wallet.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpOperationalAudit_model_1 = require("../../../models/walletTopUpOperationalAudit.model");
const walletTopUpProviderFailure_service_1 = require("../../../services/financial/walletTopUpProviderFailure.service");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const walletTopUpRetry_service_1 = require("../../../services/financial/walletTopUpRetry.service");
const walletTopUpOperationalAction_enum_1 = require("../../../enums/financial/walletTopUpOperationalAction.enum");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerProviderFailureTests = () => {
    (0, node_test_1.test)("phase7h provider failure: guarded finalization is idempotent and effect-free", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 800, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        const first = await walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(request.topUpReference, actors.adminId.toString());
        const finalized = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        const finalizedAt = finalized.failureFinalizedAt?.getTime();
        const replay = await walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(request.topUpReference, actors.adminId.toString());
        const afterReplay = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        strict_1.default.equal(finalized.status, "FAILED");
        strict_1.default.ok(finalized.failureCode);
        strict_1.default.ok(finalized.failureFinalizedBy?.equals(actors.adminId));
        strict_1.default.equal(afterReplay.failureFinalizedAt?.getTime(), finalizedAt);
        strict_1.default.equal(first.topUpReference, replay.topUpReference);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 0);
        strict_1.default.equal(await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.countDocuments({
            topUpReference: request.topUpReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE,
            result: "SUCCEEDED",
        }), 1);
    });
    (0, node_test_1.test)("phase7h provider failure: 10 concurrent finalizers converge to one timestamp", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 810, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(request.topUpReference, actors.adminId.toString())));
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
        const failed = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        strict_1.default.equal(failed.status, "FAILED");
        strict_1.default.ok(failed.failureFinalizedAt);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 0);
    });
    (0, node_test_1.test)("phase7h provider failure: existing Ledger or projection rejects finalization", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const ledgerCase = await (0, topUpFixtures_1.createFundedTopUp)(actors, 200, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        await (0, topUpFixtures_1.establishLedgerStage)(ledgerCase.request, ledgerCase.funding);
        await strict_1.default.rejects(() => walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(ledgerCase.request.topUpReference, actors.adminId.toString()));
        strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(ledgerCase.request.topUpReference)).status, "PROCESSING");
        const projectionCase = await (0, topUpFixtures_1.createFundedTopUp)(actors, 250, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        await (0, topUpFixtures_1.establishProjectionStage)(projectionCase.request, projectionCase.funding);
        await strict_1.default.rejects(() => walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(projectionCase.request.topUpReference, actors.adminId.toString()));
        strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(projectionCase.request.topUpReference)).status, "PROCESSING");
    });
    (0, node_test_1.test)("phase7h retry/failure race: terminal failure produces no new accounting effect", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 975, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        const reconciliation = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
        const settled = await Promise.allSettled([
            walletTopUpRetry_service_1.walletTopUpRetryService.retry(reconciliation.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING, actors.adminId.toString()),
            walletTopUpProviderFailure_service_1.walletTopUpProviderFailureService.finalize(request.topUpReference, actors.adminId.toString()),
        ]);
        strict_1.default.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
        strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(request.topUpReference)).status, "FAILED");
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 0);
    });
};
exports.registerProviderFailureTests = registerProviderFailureTests;
