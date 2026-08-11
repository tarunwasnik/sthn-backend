import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalOperationalInspectionService } from
  "../../../services/financial/creatorWithdrawalOperationalInspection.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createHealthyWithdrawalFixture,
  createInitializedWithdrawalProviderFixture,
  snapshotWithdrawalOperationalMoney,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalOperationalInspectionTests = () => {
  test("phase9e classifies healthy completion and failure without money movement", async () => {
    for (const [outcome, classification] of [
      [Outcome.SUCCESS, "HEALTHY_COMPLETED"],
      [Outcome.FAILURE, "HEALTHY_FAILED"],
    ] as const) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createHealthyWithdrawalFixture(server.baseUrl, outcome);
        const before = await snapshotWithdrawalOperationalMoney(
          fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id,
        );
        const inspection = await creatorWithdrawalOperationalInspectionService
          .inspect(fixture.withdrawal.withdrawalReference);
        assert.equal(inspection.classification, classification);
        assert.deepEqual(await snapshotWithdrawalOperationalMoney(
          fixture.withdrawal.withdrawalReference, fixture.creatorWallet._id,
        ), before);
      } finally { await server.close(); }
    }
  });

  test("phase9e classifies provider initialized and processing as non-retryable", async () => {
    for (const [processing, classification] of [
      [false, "PROVIDER_INITIALIZED"], [true, "PROVIDER_PROCESSING"],
    ] as const) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createInitializedWithdrawalProviderFixture(server.baseUrl);
        if (processing) await InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { providerStatus: "PROCESSING", processingAt: new Date() },
          $inc: { version: 1 } });
        const inspection = await creatorWithdrawalOperationalInspectionService
          .inspect(fixture.withdrawal.withdrawalReference);
        assert.equal(inspection.classification, classification);
        assert.equal(inspection.allowedActions.includes(
          "RETRY_FINALIZATION" as never), false);
      } finally { await server.close(); }
    }
  });

  test("phase9e deterministically classifies financial graph corruption as non-retryable", async () => {
    const cases: Array<{
      expected: string;
      mutate: (fixture: Awaited<ReturnType<typeof createHealthyWithdrawalFixture>>)
        => Promise<unknown>;
    }> = [
      { expected: "AMOUNT_CONFLICT", mutate: (fixture) =>
        InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $inc: { amount: 1 } }) },
      { expected: "CURRENCY_CONFLICT", mutate: (fixture) =>
        InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { currency: "USD" } }) },
      { expected: "DESTINATION_CONFLICT", mutate: (fixture) =>
        InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { destinationReference: "PD-CONFLICT" } }) },
      { expected: "PROVIDER_IDENTITY_CONFLICT", mutate: (fixture) =>
        InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { providerReference: "IWP-CONFLICT" } }) },
      { expected: "CORRUPTED_PROVIDER", mutate: (fixture) =>
        InternalWithdrawalProviderRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { "terminalResult.outcome": "FAILURE" } }) },
      { expected: "CORRUPTED_RESERVATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+ledgerTransactionReference").orFail();
        return LedgerEntry.deleteOne({
          transactionId: withdrawal.ledgerTransactionReference,
        });
      } },
      { expected: "CORRUPTED_RESERVATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+ledgerTransactionReference").orFail();
        const entry = await LedgerEntry.findOne({
          transactionId: withdrawal.ledgerTransactionReference,
        }).lean().orFail();
        const { _id, ledgerReference, postingKey, ...copy } = entry;
        return LedgerEntry.collection.insertOne({ ...copy,
          ledgerReference: `${ledgerReference}-duplicate`,
          postingKey: `${postingKey}-duplicate` } as never);
      } },
      { expected: "CORRUPTED_RESERVATION_PROJECTION", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        return WalletProjectionOperation.collection.updateOne({
          operationReference: withdrawal.projectionReference,
        }, { $set: { "deltas.reservedBalance": 1 } });
      } },
      { expected: "CORRUPTED_WALLET", mutate: (fixture) =>
        Wallet.collection.updateOne({ _id: fixture.creatorWallet._id },
          { $inc: { currentBalance: 1 } }) },
      { expected: "CORRUPTED_WALLET", mutate: (fixture) =>
        Wallet.collection.updateOne({ _id: fixture.creatorWallet._id },
          { $set: { userId: new Types.ObjectId() } }) },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        return LedgerEntry.deleteOne({
          transactionId: withdrawal.finalizationTransactionId,
        });
      } },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        const entry = await LedgerEntry.findOne({
          transactionId: withdrawal.finalizationTransactionId,
        }).select("+postingKey").lean().orFail();
        const { _id, ledgerReference, postingKey, ...copy } = entry;
        return LedgerEntry.collection.insertOne({ ...copy,
          ledgerReference: `${ledgerReference}-duplicate`,
          postingKey: `${postingKey}-duplicate` } as never);
      } },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        return LedgerEntry.collection.updateOne({
          transactionId: withdrawal.finalizationTransactionId,
          account: "PAYOUT_CLEARING",
        }, { $set: { account: "WALLET_AVAILABLE" } });
      } },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        return LedgerEntry.collection.updateOne({
          transactionId: withdrawal.finalizationTransactionId,
          account: "PAYOUT_CLEARING",
        }, { $set: { direction: "DEBIT" } });
      } },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        return LedgerEntry.collection.updateOne({
          transactionId: withdrawal.finalizationTransactionId,
        }, { $inc: { amount: 1 } });
      } },
      { expected: "CORRUPTED_FINALIZATION_LEDGER", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId").orFail();
        return LedgerEntry.collection.updateOne({
          transactionId: withdrawal.finalizationTransactionId,
        }, { $set: { currency: "USD" } });
      } },
      { expected: "CORRUPTED_FINALIZATION_PROJECTION", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationProjectionOperationReference").orFail();
        return WalletProjectionOperation.deleteOne({ operationReference:
          withdrawal.finalizationProjectionOperationReference });
      } },
      { expected: "CORRUPTED_FINALIZATION_PROJECTION", mutate: async (fixture) => {
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationProjectionOperationReference").orFail();
        return WalletProjectionOperation.collection.updateOne({
          operationReference: withdrawal.finalizationProjectionOperationReference,
        }, { $set: { "deltas.reservedBalance": 0 } });
      } },
      { expected: "OUTCOME_CONFLICT", mutate: (fixture) =>
        CreatorWithdrawalRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { status: "FAILED" } }) },
      { expected: "MISSING_AUDIT", mutate: () => AuditLog.deleteOne({
        action: "CREATOR_WITHDRAWAL_COMPLETED",
      }) },
      { expected: "TRANSACTION_CONFLICT", mutate: (fixture) =>
        CreatorWithdrawalRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { finalizationTransactionId: "conflicting-transaction" } }) },
      { expected: "TRANSACTION_CONFLICT", mutate: (fixture) =>
        CreatorWithdrawalRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { finalizationProjectionOperationReference:
          "conflicting-projection" } }) },
    ];
    for (const item of cases) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
          Outcome.SUCCESS);
        await item.mutate(fixture);
        const inspection = await creatorWithdrawalOperationalInspectionService
          .inspect(fixture.withdrawal.withdrawalReference);
        assert.equal(inspection.classification, item.expected);
        assert.equal(inspection.allowedActions.includes(
          "RETRY_FINALIZATION" as never), false);
      } finally { await server.close(); }
    }
  });
};
