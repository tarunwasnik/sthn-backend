import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletTopUpRequest } from "../../../models/walletTopUpRequest.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { WalletTopUpReconciliation } from "../../../models/walletTopUpReconciliation.model";
import { WalletTopUpRetryAttempt } from "../../../models/walletTopUpRetryAttempt.model";
import { WalletTopUpOperationalAudit } from "../../../models/walletTopUpOperationalAudit.model";
import { WalletTopUpReconciliationClassification as Classification } from "../../../enums/financial/walletTopUpReconciliationClassification.enum";
import { WalletTopUpOperationalAction } from "../../../enums/financial/walletTopUpOperationalAction.enum";
import { InternalTopUpFundingOutcome } from "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { walletTopUpRetryService } from "../../../services/financial/walletTopUpRetry.service";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  establishLedgerStage,
  establishProjectionStage,
} from "./fixtures/topUpFixtures";

const classification = async (reference: string) =>
  (await walletTopUpReconciliationService.inspectForOperation(reference))
    .observation.classification;

export const registerReconciliationTests = () => {
  test("phase7h reconciliation: 10 concurrent inspections deduplicate identity and snapshot", { timeout: 60_000 }, async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 500);
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      walletTopUpReconciliationService.inspectForOperation(request.topUpReference)));
    assert.equal(await WalletTopUpReconciliation.countDocuments({
      topUpReference: request.topUpReference,
    }), 1);
    assert.equal(new Set(results.map((item) => item.reconciliation.reconciliationReference)).size, 1);
    assert.equal(new Set(results.map((item) => item.observation.fingerprint)).size, 1);
    assert.equal(new Set(results.map((item) => item.observation.classification)).size, 1);
  });

  test("phase7h reconciliation: persisted states classify deterministically without financial mutation", { timeout: 120_000 }, async () => {
    const completedActors = await createActors();
    const completed = await createFundedTopUp(completedActors, 101);
    await completeFundedTopUp(completed.request.topUpReference);
    assert.equal(await classification(completed.request.topUpReference), Classification.COMPLETED_VALID);

    const pendingActors = await createActors();
    const pending = await createFundedTopUp(pendingActors, 102);
    await InternalTopUpFunding.collection.updateOne(
      { _id: pending.funding._id }, { $set: { status: "PROCESSING" } },
    );
    assert.equal(await classification(pending.request.topUpReference), Classification.RETRYABLE_PROVIDER_PENDING);

    const failedActors = await createActors();
    const failed = await createFundedTopUp(failedActors, 103, InternalTopUpFundingOutcome.FAILURE);
    assert.equal(await classification(failed.request.topUpReference), Classification.PROVIDER_FAILED);

    const notStartedActors = await createActors();
    const notStarted = await createFundedTopUp(notStartedActors, 104);
    assert.equal(await classification(notStarted.request.topUpReference), Classification.ACCOUNTING_NOT_STARTED);

    const ledgerActors = await createActors();
    const ledgerOnly = await createFundedTopUp(ledgerActors, 105);
    await establishLedgerStage(ledgerOnly.request, ledgerOnly.funding);
    assert.equal(await classification(ledgerOnly.request.topUpReference), Classification.LEDGER_ONLY);

    const completionActors = await createActors();
    const completion = await createFundedTopUp(completionActors, 106);
    await establishProjectionStage(completion.request, completion.funding);
    assert.equal(await classification(completion.request.topUpReference), Classification.COMPLETION_PENDING);

    const corruptActors = await createActors();
    const corrupt = await createFundedTopUp(corruptActors, 107);
    await completeFundedTopUp(corrupt.request.topUpReference);
    await WalletTopUpRequest.collection.updateOne(
      { _id: corrupt.request._id }, { $unset: { ledgerReference: "" } },
    );
    assert.equal(await classification(corrupt.request.topUpReference), Classification.COMPLETED_CORRUPTED);

    const orphanActors = await createActors();
    const orphan = await createFundedTopUp(orphanActors, 108);
    const orphanStage = await establishProjectionStage(orphan.request, orphan.funding);
    await LedgerEntry.collection.deleteOne({ _id: orphanStage.ledger._id });
    assert.equal(await classification(orphan.request.topUpReference), Classification.ORPHAN_PROJECTION);

    const ledgerConflictActors = await createActors();
    const ledgerConflict = await createFundedTopUp(ledgerConflictActors, 109);
    const conflictingLedger = await establishLedgerStage(ledgerConflict.request, ledgerConflict.funding);
    await LedgerEntry.collection.updateOne(
      { _id: conflictingLedger.ledger._id }, { $set: { source: "PAYMENT" } },
    );
    assert.equal(await classification(ledgerConflict.request.topUpReference), Classification.LEDGER_CONFLICT);

    const projectionConflictActors = await createActors();
    const projectionConflict = await createFundedTopUp(projectionConflictActors, 110);
    const conflictingProjection = await establishProjectionStage(
      projectionConflict.request, projectionConflict.funding,
    );
    await WalletProjectionOperation.collection.updateOne(
      { _id: conflictingProjection.operation._id },
      { $set: { "deltas.reservedBalance": 1 } },
    );
    assert.equal(await classification(projectionConflict.request.topUpReference), Classification.PROJECTION_CONFLICT);

    const requestConflictActors = await createActors();
    const requestConflict = await createFundedTopUp(requestConflictActors, 111);
    const requestLedger = await establishLedgerStage(requestConflict.request, requestConflict.funding);
    await WalletTopUpRequest.collection.updateOne(
      { _id: requestConflict.request._id },
      { $set: { ledgerEntryId: new Types.ObjectId(), ledgerReference: requestLedger.ledger.ledgerReference } },
    );
    assert.equal(await classification(requestConflict.request.topUpReference), Classification.REQUEST_LINK_CONFLICT);

    const walletConflictActors = await createActors();
    const walletConflict = await createFundedTopUp(walletConflictActors, 112);
    await Wallet.collection.updateOne(
      { _id: walletConflictActors.wallet._id }, { $set: { userId: new Types.ObjectId() } },
    );
    assert.equal(await classification(walletConflict.request.topUpReference), Classification.WALLET_CONFLICT);

    const amountActors = await createActors();
    const amountConflict = await createFundedTopUp(amountActors, 113);
    const amountLedger = await establishLedgerStage(amountConflict.request, amountConflict.funding);
    await LedgerEntry.collection.updateOne(
      { _id: amountLedger.ledger._id }, { $set: { amount: 114 } },
    );
    assert.equal(await classification(amountConflict.request.topUpReference), Classification.AMOUNT_CONFLICT);

    const currencyActors = await createActors();
    const currencyConflict = await createFundedTopUp(currencyActors, 115);
    const currencyLedger = await establishLedgerStage(currencyConflict.request, currencyConflict.funding);
    await LedgerEntry.collection.updateOne(
      { _id: currencyLedger.ledger._id }, { $set: { currency: "USD" } },
    );
    assert.equal(await classification(currencyConflict.request.topUpReference), Classification.CURRENCY_CONFLICT);

    const transactionActors = await createActors();
    const transactionConflict = await createFundedTopUp(transactionActors, 116);
    await WalletTopUpRequest.collection.updateOne(
      { _id: transactionConflict.request._id },
      { $set: { accountingTransactionId: "TUA-CONFLICT" } },
    );
    assert.equal(await classification(transactionConflict.request.topUpReference), Classification.TRANSACTION_CONFLICT);

    const unknownActors = await createActors();
    const unknown = await createFundedTopUp(unknownActors, 117);
    await InternalTopUpFunding.collection.deleteOne({ _id: unknown.funding._id });
    assert.equal(await classification(unknown.request.topUpReference), Classification.UNKNOWN_INTEGRITY_FAILURE);
  });

  test("phase7h retry: eligible state invokes Phase 7F, records attempt, and resolves", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 650);
    const inspected = await walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
    const result = await walletTopUpRetryService.retry(
      inspected.reconciliation.reconciliationReference,
      WalletTopUpOperationalAction.RETRY_ACCOUNTING,
      actors.adminId.toString(),
    );
    assert.equal(result.classification, Classification.COMPLETED_VALID);
    assert.equal(result.status, "RESOLVED");
    const reconciliation = await WalletTopUpReconciliation.findOne({
      topUpReference: request.topUpReference,
    });
    assert.equal(reconciliation?.retryCount, 1);
    assert.equal(await WalletTopUpRetryAttempt.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
      resultCode: "COMPLETED_VALID",
    }), 1);
    assert.equal(await WalletTopUpOperationalAudit.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
      reasonCode: "RETRY_SUCCEEDED",
    }), 1);
  });

  test("phase7h retry: concurrent requests cannot bypass durable attempt guard", { timeout: 60_000 }, async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 675);
    const inspected = await walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
    const settled = await Promise.allSettled(Array.from({ length: 8 }, () =>
      walletTopUpRetryService.retry(
        inspected.reconciliation.reconciliationReference,
        WalletTopUpOperationalAction.RETRY_ACCOUNTING,
        actors.adminId.toString(),
      )));
    assert.ok(settled.some((item) => item.status === "fulfilled"));
    assert.equal(await LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
    assert.equal(await WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 675);
    assert.equal(await WalletTopUpRetryAttempt.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
    }), 1);
  });
};
