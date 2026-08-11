import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose, { Types } from "mongoose";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletTopUpRequest } from "../../../models/walletTopUpRequest.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { WalletTopUpReconciliation } from "../../../models/walletTopUpReconciliation.model";
import { WalletTopUpRetryAttempt } from "../../../models/walletTopUpRetryAttempt.model";
import { WalletTopUpRepairOperation } from "../../../models/walletTopUpRepairOperation.model";
import { WalletTopUpOperationalAudit } from "../../../models/walletTopUpOperationalAudit.model";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import { walletTopUpProviderFailureService } from "../../../services/financial/walletTopUpProviderFailure.service";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { walletTopUpRepairService } from "../../../services/financial/walletTopUpRepair.service";
import { WalletTopUpOperationalAction } from "../../../enums/financial/walletTopUpOperationalAction.enum";
import { InternalTopUpFundingOutcome } from "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { FinancialError } from "../../../errors/financial/FinancialError";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  establishLedgerStage,
  reloadRequest,
} from "./fixtures/topUpFixtures";

type Corruption =
  | "MISSING_PROVIDER_LINK" | "WRONG_PROVIDER_REFERENCE" | "PROVIDER_NOT_SUCCEEDED"
  | "MISSING_LEDGER" | "WRONG_LEDGER_REFERENCE" | "WRONG_LEDGER_AMOUNT"
  | "WRONG_LEDGER_CURRENCY" | "WRONG_LEDGER_USER" | "WRONG_LEDGER_SOURCE_TYPE"
  | "MISSING_PROJECTION" | "PROJECTION_WRONG_LEDGER" | "PROJECTION_WRONG_WALLET"
  | "PROJECTION_WRONG_DELTA" | "MISSING_TRANSACTION" | "TRANSACTION_MISMATCH"
  | "WALLET_OWNER" | "WALLET_CURRENCY" | "MISSING_COMPLETION";

const corruptions: Corruption[] = [
  "MISSING_PROVIDER_LINK", "WRONG_PROVIDER_REFERENCE", "PROVIDER_NOT_SUCCEEDED",
  "MISSING_LEDGER", "WRONG_LEDGER_REFERENCE", "WRONG_LEDGER_AMOUNT",
  "WRONG_LEDGER_CURRENCY", "WRONG_LEDGER_USER", "WRONG_LEDGER_SOURCE_TYPE",
  "MISSING_PROJECTION", "PROJECTION_WRONG_LEDGER", "PROJECTION_WRONG_WALLET",
  "PROJECTION_WRONG_DELTA", "MISSING_TRANSACTION", "TRANSACTION_MISMATCH",
  "WALLET_OWNER", "WALLET_CURRENCY", "MISSING_COMPLETION",
];

const mutateCorruption = async (
  corruption: Corruption,
  requestId: Types.ObjectId,
  fundingId: Types.ObjectId,
  ledgerId: Types.ObjectId,
  operationId: Types.ObjectId,
  walletId: Types.ObjectId,
) => {
  switch (corruption) {
    case "MISSING_PROVIDER_LINK":
      return WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $unset: { providerFundingId: "" } });
    case "WRONG_PROVIDER_REFERENCE":
      return WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { providerFundingReference: "ITF-WRONG" } });
    case "PROVIDER_NOT_SUCCEEDED":
      return InternalTopUpFunding.collection.updateOne({ _id: fundingId }, { $set: { status: "PROCESSING" } });
    case "MISSING_LEDGER":
      return LedgerEntry.collection.deleteOne({ _id: ledgerId });
    case "WRONG_LEDGER_REFERENCE":
      return WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { ledgerReference: "LEDGER-WRONG" } });
    case "WRONG_LEDGER_AMOUNT":
      return LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { amount: 999_999 } });
    case "WRONG_LEDGER_CURRENCY":
      return LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { currency: "USD" } });
    case "WRONG_LEDGER_USER":
      return LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { userId: new Types.ObjectId() } });
    case "WRONG_LEDGER_SOURCE_TYPE":
      return LedgerEntry.collection.updateOne({ _id: ledgerId }, { $set: { source: "PAYMENT", type: "SETTLEMENT" } });
    case "MISSING_PROJECTION":
      return WalletProjectionOperation.collection.deleteOne({ _id: operationId });
    case "PROJECTION_WRONG_LEDGER":
      return WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { ledgerEntryIds: [new Types.ObjectId()] } });
    case "PROJECTION_WRONG_WALLET":
      return WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { walletId: new Types.ObjectId() } });
    case "PROJECTION_WRONG_DELTA":
      return WalletProjectionOperation.collection.updateOne({ _id: operationId }, { $set: { "deltas.availableBalance": 999_999 } });
    case "MISSING_TRANSACTION":
      return WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $unset: { accountingTransactionId: "" } });
    case "TRANSACTION_MISMATCH":
      return WalletTopUpRequest.collection.updateOne({ _id: requestId }, { $set: { accountingTransactionId: "TUA-MISMATCH" } });
    case "WALLET_OWNER":
      return Wallet.collection.updateOne({ _id: walletId }, { $set: { userId: new Types.ObjectId() } });
    case "WALLET_CURRENCY":
      return Wallet.collection.updateOne({ _id: walletId }, { $set: { currency: "USD" } });
    case "MISSING_COMPLETION":
      return WalletTopUpRequest.collection.updateOne(
        { _id: requestId }, { $unset: { completedAt: "", accountingCompletedAt: "" } },
      );
  }
};

export const registerIntegrityTests = () => {
  for (const corruption of corruptions) {
    test(`phase7h completed corruption fails closed: ${corruption}`, async () => {
      const actors = await createActors();
      const { request, funding } = await createFundedTopUp(actors, 515);
      await completeFundedTopUp(request.topUpReference);
      const completed = await reloadRequest(request.topUpReference);
      assert.ok(completed.ledgerEntryId && completed.walletProjectionOperationId);
      const beforeWallet = await Wallet.findById(actors.wallet._id);
      const beforeLedgerCount = await LedgerEntry.countDocuments({});
      const beforeProjectionCount = await WalletProjectionOperation.countDocuments({});
      await mutateCorruption(
        corruption,
        completed._id as Types.ObjectId,
        funding._id as Types.ObjectId,
        completed.ledgerEntryId,
        completed.walletProjectionOperationId,
        actors.wallet._id as Types.ObjectId,
      );
      const providerStatus = (await InternalTopUpFunding.findById(funding._id))?.status;
      await assert.rejects(
        () => completeFundedTopUp(request.topUpReference),
        (error: unknown) => {
          assert.ok(error instanceof FinancialError);
          assert.match(error.code, /^WALLET_TOP_UP_ACCOUNTING_/);
          return true;
        },
      );
      assert.equal(await LedgerEntry.countDocuments({}), beforeLedgerCount -
        (corruption === "MISSING_LEDGER" ? 1 : 0));
      assert.equal(await WalletProjectionOperation.countDocuments({}), beforeProjectionCount -
        (corruption === "MISSING_PROJECTION" ? 1 : 0));
      assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, beforeWallet?.availableBalance);
      assert.equal((await WalletTopUpRequest.findById(request._id))?.status, "COMPLETED");
      assert.equal((await InternalTopUpFunding.findById(funding._id))?.status, providerStatus);
    });
  }

  test("phase7h Wallet-versus-Ledger proof includes replay, failed top-up, repair, and inspection", async () => {
    const actors = await createActors();
    const amounts = [1_000, 2_500, 400];
    const successful = [];
    for (const amount of amounts) {
      const fixture = await createFundedTopUp(actors, amount);
      await completeFundedTopUp(fixture.request.topUpReference);
      successful.push(fixture);
    }
    await completeFundedTopUp(successful[0].request.topUpReference);
    const failed = await createFundedTopUp(actors, 900, InternalTopUpFundingOutcome.FAILURE);
    await walletTopUpProviderFailureService.finalize(
      failed.request.topUpReference, actors.adminId.toString(),
    );
    await WalletTopUpRequest.collection.updateOne(
      { _id: successful[1].request._id }, { $unset: { ledgerReference: "", ledgerEntryId: "" } },
    );
    const repairCase = await walletTopUpReconciliationService.inspectForOperation(
      successful[1].request.topUpReference,
    );
    await walletTopUpRepairService.repair(
      repairCase.reconciliation.reconciliationReference,
      WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
      actors.adminId.toString(),
    );
    await walletTopUpReconciliationService.inspect(
      successful[2].request.topUpReference, actors.adminId.toString(),
    );

    const ledgers = await LedgerEntry.find({ userId: actors.userId, type: "WALLET_TOP_UP" });
    const operations = await WalletProjectionOperation.find({ walletId: actors.wallet._id });
    const wallet = await Wallet.findById(actors.wallet._id);
    const ledgerTotal = ledgers.reduce((sum, entry) => sum + entry.amount, 0);
    const projectionTotal = operations.reduce(
      (sum, operation) => sum + operation.deltas.availableBalance, 0,
    );
    assert.equal(ledgerTotal, 3_900);
    assert.equal(projectionTotal, 3_900);
    assert.equal(wallet?.availableBalance, 3_900);
    assert.equal(wallet?.currentBalance, 3_900);
    assert.equal(await LedgerEntry.countDocuments({}), 3);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 3);
  });

  test("phase7h explicit session: projection transaction abort leaves no operation or balance delta", async () => {
    const actors = await createActors();
    const { request, funding } = await createFundedTopUp(actors, 333);
    const { ledger, identity } = await establishLedgerStage(request, funding);
    const session = await mongoose.startSession();
    await assert.rejects(() => session.withTransaction(async () => {
      await walletProjectionService.applyProjectionMutation({
        userId: request.userId,
        currency: request.currency,
        operationKey: identity.operationKey,
        deltas: { availableBalance: request.amount },
        ledgerEntryIds: [ledger._id as Types.ObjectId],
      }, session);
      throw new Error("ABORT_PHASE7H_TRANSACTION");
    }));
    await session.endSession();
    assert.equal(await WalletProjectionOperation.countDocuments({ operationKey: identity.operationKey }), 0);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 0);
  });

  test("phase7h MongoDB indexes enforce deterministic identities", async () => {
    const collections = [
      WalletTopUpRequest, InternalTopUpFunding, LedgerEntry, WalletProjectionOperation,
      WalletTopUpReconciliation, WalletTopUpRetryAttempt,
      WalletTopUpRepairOperation, WalletTopUpOperationalAudit,
    ];
    for (const model of collections) {
      const indexes = await model.collection.indexes();
      assert.ok(indexes.some((index) => index.name === "_id_"));
    }
    const uniqueKeys = async (model: typeof WalletTopUpRequest) =>
      (await model.collection.indexes())
        .filter((index) => index.unique)
        .map((index) => JSON.stringify(index.key));
    assert.ok((await uniqueKeys(WalletTopUpRequest)).some((key) => key.includes("topUpReference")));
    assert.ok((await InternalTopUpFunding.collection.indexes()).some(
      (index) => index.unique && "topUpRequestId" in index.key,
    ));
    assert.ok((await LedgerEntry.collection.indexes()).some(
      (index) => index.unique && "postingKey" in index.key,
    ));
    assert.ok((await WalletProjectionOperation.collection.indexes()).some(
      (index) => index.unique && "operationKey" in index.key,
    ));
    assert.ok((await WalletTopUpReconciliation.collection.indexes()).some(
      (index) => index.unique && "reconciliationKey" in index.key,
    ));
    assert.ok((await WalletTopUpRetryAttempt.collection.indexes()).some(
      (index) => index.unique && "operationKey" in index.key,
    ));
    assert.ok((await WalletTopUpRepairOperation.collection.indexes()).some(
      (index) => index.unique && "operationKey" in index.key,
    ));
    assert.ok((await WalletTopUpOperationalAudit.collection.indexes()).some(
      (index) => index.unique && "auditReference" in index.key,
    ));
  });
};
