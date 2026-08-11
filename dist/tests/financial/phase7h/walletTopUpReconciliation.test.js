"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReconciliationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletTopUpReconciliation_model_1 = require("../../../models/walletTopUpReconciliation.model");
const walletTopUpRetryAttempt_model_1 = require("../../../models/walletTopUpRetryAttempt.model");
const walletTopUpOperationalAudit_model_1 = require("../../../models/walletTopUpOperationalAudit.model");
const walletTopUpReconciliationClassification_enum_1 = require("../../../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpOperationalAction_enum_1 = require("../../../enums/financial/walletTopUpOperationalAction.enum");
const internalTopUpFundingOutcome_enum_1 = require("../../../enums/financial/internalTopUpFundingOutcome.enum");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const walletTopUpRetry_service_1 = require("../../../services/financial/walletTopUpRetry.service");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const classification = async (reference) => (await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(reference))
    .observation.classification;
const registerReconciliationTests = () => {
    (0, node_test_1.test)("phase7h reconciliation: 10 concurrent inspections deduplicate identity and snapshot", { timeout: 60000 }, async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 500);
        const results = await Promise.all(Array.from({ length: 10 }, () => walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference)));
        strict_1.default.equal(await walletTopUpReconciliation_model_1.WalletTopUpReconciliation.countDocuments({
            topUpReference: request.topUpReference,
        }), 1);
        strict_1.default.equal(new Set(results.map((item) => item.reconciliation.reconciliationReference)).size, 1);
        strict_1.default.equal(new Set(results.map((item) => item.observation.fingerprint)).size, 1);
        strict_1.default.equal(new Set(results.map((item) => item.observation.classification)).size, 1);
    });
    (0, node_test_1.test)("phase7h reconciliation: persisted states classify deterministically without financial mutation", { timeout: 120000 }, async () => {
        const completedActors = await (0, topUpFixtures_1.createActors)();
        const completed = await (0, topUpFixtures_1.createFundedTopUp)(completedActors, 101);
        await (0, topUpFixtures_1.completeFundedTopUp)(completed.request.topUpReference);
        strict_1.default.equal(await classification(completed.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID);
        const pendingActors = await (0, topUpFixtures_1.createActors)();
        const pending = await (0, topUpFixtures_1.createFundedTopUp)(pendingActors, 102);
        await internalTopUpFunding_model_1.InternalTopUpFunding.collection.updateOne({ _id: pending.funding._id }, { $set: { status: "PROCESSING" } });
        strict_1.default.equal(await classification(pending.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.RETRYABLE_PROVIDER_PENDING);
        const failedActors = await (0, topUpFixtures_1.createActors)();
        const failed = await (0, topUpFixtures_1.createFundedTopUp)(failedActors, 103, internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE);
        strict_1.default.equal(await classification(failed.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROVIDER_FAILED);
        const notStartedActors = await (0, topUpFixtures_1.createActors)();
        const notStarted = await (0, topUpFixtures_1.createFundedTopUp)(notStartedActors, 104);
        strict_1.default.equal(await classification(notStarted.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ACCOUNTING_NOT_STARTED);
        const ledgerActors = await (0, topUpFixtures_1.createActors)();
        const ledgerOnly = await (0, topUpFixtures_1.createFundedTopUp)(ledgerActors, 105);
        await (0, topUpFixtures_1.establishLedgerStage)(ledgerOnly.request, ledgerOnly.funding);
        strict_1.default.equal(await classification(ledgerOnly.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_ONLY);
        const completionActors = await (0, topUpFixtures_1.createActors)();
        const completion = await (0, topUpFixtures_1.createFundedTopUp)(completionActors, 106);
        await (0, topUpFixtures_1.establishProjectionStage)(completion.request, completion.funding);
        strict_1.default.equal(await classification(completion.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING);
        const corruptActors = await (0, topUpFixtures_1.createActors)();
        const corrupt = await (0, topUpFixtures_1.createFundedTopUp)(corruptActors, 107);
        await (0, topUpFixtures_1.completeFundedTopUp)(corrupt.request.topUpReference);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: corrupt.request._id }, { $unset: { ledgerReference: "" } });
        strict_1.default.equal(await classification(corrupt.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_CORRUPTED);
        const orphanActors = await (0, topUpFixtures_1.createActors)();
        const orphan = await (0, topUpFixtures_1.createFundedTopUp)(orphanActors, 108);
        const orphanStage = await (0, topUpFixtures_1.establishProjectionStage)(orphan.request, orphan.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.deleteOne({ _id: orphanStage.ledger._id });
        strict_1.default.equal(await classification(orphan.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ORPHAN_PROJECTION);
        const ledgerConflictActors = await (0, topUpFixtures_1.createActors)();
        const ledgerConflict = await (0, topUpFixtures_1.createFundedTopUp)(ledgerConflictActors, 109);
        const conflictingLedger = await (0, topUpFixtures_1.establishLedgerStage)(ledgerConflict.request, ledgerConflict.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: conflictingLedger.ledger._id }, { $set: { source: "PAYMENT" } });
        strict_1.default.equal(await classification(ledgerConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_CONFLICT);
        const projectionConflictActors = await (0, topUpFixtures_1.createActors)();
        const projectionConflict = await (0, topUpFixtures_1.createFundedTopUp)(projectionConflictActors, 110);
        const conflictingProjection = await (0, topUpFixtures_1.establishProjectionStage)(projectionConflict.request, projectionConflict.funding);
        await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: conflictingProjection.operation._id }, { $set: { "deltas.reservedBalance": 1 } });
        strict_1.default.equal(await classification(projectionConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROJECTION_CONFLICT);
        const requestConflictActors = await (0, topUpFixtures_1.createActors)();
        const requestConflict = await (0, topUpFixtures_1.createFundedTopUp)(requestConflictActors, 111);
        const requestLedger = await (0, topUpFixtures_1.establishLedgerStage)(requestConflict.request, requestConflict.funding);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: requestConflict.request._id }, { $set: { ledgerEntryId: new mongoose_1.Types.ObjectId(), ledgerReference: requestLedger.ledger.ledgerReference } });
        strict_1.default.equal(await classification(requestConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.REQUEST_LINK_CONFLICT);
        const walletConflictActors = await (0, topUpFixtures_1.createActors)();
        const walletConflict = await (0, topUpFixtures_1.createFundedTopUp)(walletConflictActors, 112);
        await wallet_model_1.Wallet.collection.updateOne({ _id: walletConflictActors.wallet._id }, { $set: { userId: new mongoose_1.Types.ObjectId() } });
        strict_1.default.equal(await classification(walletConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.WALLET_CONFLICT);
        const amountActors = await (0, topUpFixtures_1.createActors)();
        const amountConflict = await (0, topUpFixtures_1.createFundedTopUp)(amountActors, 113);
        const amountLedger = await (0, topUpFixtures_1.establishLedgerStage)(amountConflict.request, amountConflict.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: amountLedger.ledger._id }, { $set: { amount: 114 } });
        strict_1.default.equal(await classification(amountConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.AMOUNT_CONFLICT);
        const currencyActors = await (0, topUpFixtures_1.createActors)();
        const currencyConflict = await (0, topUpFixtures_1.createFundedTopUp)(currencyActors, 115);
        const currencyLedger = await (0, topUpFixtures_1.establishLedgerStage)(currencyConflict.request, currencyConflict.funding);
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: currencyLedger.ledger._id }, { $set: { currency: "USD" } });
        strict_1.default.equal(await classification(currencyConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.CURRENCY_CONFLICT);
        const transactionActors = await (0, topUpFixtures_1.createActors)();
        const transactionConflict = await (0, topUpFixtures_1.createFundedTopUp)(transactionActors, 116);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: transactionConflict.request._id }, { $set: { accountingTransactionId: "TUA-CONFLICT" } });
        strict_1.default.equal(await classification(transactionConflict.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.TRANSACTION_CONFLICT);
        const unknownActors = await (0, topUpFixtures_1.createActors)();
        const unknown = await (0, topUpFixtures_1.createFundedTopUp)(unknownActors, 117);
        await internalTopUpFunding_model_1.InternalTopUpFunding.collection.deleteOne({ _id: unknown.funding._id });
        strict_1.default.equal(await classification(unknown.request.topUpReference), walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.UNKNOWN_INTEGRITY_FAILURE);
    });
    (0, node_test_1.test)("phase7h retry: eligible state invokes Phase 7F, records attempt, and resolves", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 650);
        const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
        const result = await walletTopUpRetry_service_1.walletTopUpRetryService.retry(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING, actors.adminId.toString());
        strict_1.default.equal(result.classification, walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID);
        strict_1.default.equal(result.status, "RESOLVED");
        const reconciliation = await walletTopUpReconciliation_model_1.WalletTopUpReconciliation.findOne({
            topUpReference: request.topUpReference,
        });
        strict_1.default.equal(reconciliation?.retryCount, 1);
        strict_1.default.equal(await walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
            resultCode: "COMPLETED_VALID",
        }), 1);
        strict_1.default.equal(await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
            reasonCode: "RETRY_SUCCEEDED",
        }), 1);
    });
    (0, node_test_1.test)("phase7h retry: concurrent requests cannot bypass durable attempt guard", { timeout: 60000 }, async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 675);
        const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
        const settled = await Promise.allSettled(Array.from({ length: 8 }, () => walletTopUpRetry_service_1.walletTopUpRetryService.retry(inspected.reconciliation.reconciliationReference, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING, actors.adminId.toString())));
        strict_1.default.ok(settled.some((item) => item.status === "fulfilled"));
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 675);
        strict_1.default.equal(await walletTopUpRetryAttempt_model_1.WalletTopUpRetryAttempt.countDocuments({
            reconciliationReference: inspected.reconciliation.reconciliationReference,
        }), 1);
    });
};
exports.registerReconciliationTests = registerReconciliationTests;
