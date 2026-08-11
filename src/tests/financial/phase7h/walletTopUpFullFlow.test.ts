import assert from "node:assert/strict";
import { test } from "node:test";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletTopUpRequestStatus } from "../../../enums/financial/walletTopUpRequestStatus.enum";
import { InternalTopUpFundingStatus } from "../../../enums/financial/internalTopUpFundingStatus.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { WalletTopUpReconciliationClassification } from "../../../enums/financial/walletTopUpReconciliationClassification.enum";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  reloadRequest,
} from "./fixtures/topUpFixtures";

export const registerFullFlowTests = () => {
  test("phase7h full flow: Admin-approved top-up persists one exact financial effect", async () => {
    const actors = await createActors();
    const initial = actors.wallet.availableBalance;
    const { request, funding } = await createFundedTopUp(actors, 1_000);
    const providerUpdatedAt = funding.updatedAt.getTime();
    const result = await completeFundedTopUp(request.topUpReference);

    const [completed, ledger, operations, wallet, reconciliation] = await Promise.all([
      reloadRequest(request.topUpReference),
      LedgerEntry.find({ "metadata.topUpReference": request.topUpReference }),
      WalletProjectionOperation.find({ walletId: actors.wallet._id }),
      Wallet.findById(actors.wallet._id),
      walletTopUpReconciliationService.inspectForOperation(request.topUpReference),
    ]);
    const reloadedFunding = await InternalTopUpFunding.findById(funding._id);
    assert.equal(completed.status, WalletTopUpRequestStatus.COMPLETED);
    assert.ok(completed.providerFundingId);
    assert.ok(completed.ledgerEntryId);
    assert.ok(completed.ledgerReference);
    assert.ok(completed.walletProjectionOperationId);
    assert.ok(completed.walletProjectionOperationReference);
    assert.ok(completed.accountingTransactionId);
    assert.ok(completed.completedAt);
    assert.equal(ledger.length, 1);
    assert.equal(operations.length, 1);
    assert.ok(wallet);
    assert.equal(wallet.availableBalance, initial + 1_000);
    assert.equal(wallet.currentBalance, initial + 1_000);
    assert.equal(wallet.reservedBalance, 0);
    assert.equal(wallet.lockedBalance, 0);
    assert.equal(ledger[0].amount, 1_000);
    assert.equal(ledger[0].currency, "INR");
    assert.equal(ledger[0].type, LedgerEntryType.WALLET_TOP_UP);
    assert.equal(ledger[0].source, LedgerSource.INTERNAL_TOP_UP_FUNDING);
    assert.equal(ledger[0].direction, MoneyDirection.CREDIT);
    assert.equal(ledger[0].account, LedgerAccount.CASH);
    assert.equal(operations[0].deltas.availableBalance, 1_000);
    assert.equal(operations[0].deltas.reservedBalance, 0);
    assert.equal(operations[0].deltas.lockedBalance, 0);
    assert.equal(operations[0].ledgerEntryIds.length, 1);
    assert.ok(operations[0].ledgerEntryIds[0].equals(ledger[0]._id));
    assert.equal(result.amount, 1_000);
    assert.equal(result.currency, "INR");
    assert.equal(result.transactionId, completed.accountingTransactionId);
    assert.equal(reloadedFunding?.status, InternalTopUpFundingStatus.SUCCEEDED);
    assert.equal(reloadedFunding?.updatedAt.getTime(), providerUpdatedAt);
    assert.equal(
      reconciliation.observation.classification,
      WalletTopUpReconciliationClassification.COMPLETED_VALID,
    );
    assert.equal("fingerprint" in result, false);
    assert.equal("walletId" in result, false);
    assert.equal("userId" in result, false);
  });
};
