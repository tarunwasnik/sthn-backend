import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../../enums/financial/ledgerEntryType.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalFinalizationService } from
  "../../../services/financial/creatorWithdrawalFinalization.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createTerminalWithdrawalFixture,
  snapshotPhase9DFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

const isPhase9DError = (error: { code?: string }) =>
  error.code?.startsWith("CREATOR_WITHDRAWAL_FINALIZATION_") === true;

export const registerWithdrawalIntegrityTests = () => {
  test("phase9d pre-finalization authority corruption fails closed", async () => {
    const corruptions: Array<{
      name: string;
      mutate: (fixture: Awaited<ReturnType<
        typeof createTerminalWithdrawalFixture
      >>) => Promise<unknown>;
    }> = [
      {
        name: "missing provider request",
        mutate: (fixture) => InternalWithdrawalProviderRequest.deleteOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }),
      },
      {
        name: "provider amount conflict",
        mutate: (fixture) => InternalWithdrawalProviderRequest.collection
          .updateOne({ withdrawalReference:
            fixture.withdrawal.withdrawalReference },
          { $inc: { amount: 1 } }),
      },
      {
        name: "provider status conflict",
        mutate: (fixture) => InternalWithdrawalProviderRequest.collection
          .updateOne({ withdrawalReference:
            fixture.withdrawal.withdrawalReference },
          { $set: { providerStatus: "PROCESSING", isTerminal: false } }),
      },
      {
        name: "provider currency conflict",
        mutate: (fixture) => InternalWithdrawalProviderRequest.collection
          .updateOne({ withdrawalReference:
            fixture.withdrawal.withdrawalReference },
          { $set: { currency: "USD" } }),
      },
      {
        name: "destination conflict",
        mutate: (fixture) => InternalWithdrawalProviderRequest.collection
          .updateOne({ withdrawalReference:
            fixture.withdrawal.withdrawalReference },
          { $set: { destinationReference: "PD-CONFLICT" } }),
      },
      {
        name: "missing original reservation Ledger",
        mutate: async (fixture) => {
          const withdrawal = await CreatorWithdrawalRequest.findOne({
            withdrawalReference: fixture.withdrawal.withdrawalReference,
          }).select("+ledgerTransactionReference").orFail();
          return LedgerEntry.deleteOne({
            transactionId: withdrawal.ledgerTransactionReference,
          });
        },
      },
      {
        name: "insufficient reserved balance",
        mutate: (fixture) => Wallet.collection.updateOne(
          { _id: fixture.creatorWallet._id },
          { $inc: { reservedBalance: -1, availableBalance: 1 } },
        ),
      },
      {
        name: "corrupted original reservation projection",
        mutate: async (fixture) => {
          const withdrawal = await CreatorWithdrawalRequest.findOne({
            withdrawalReference: fixture.withdrawal.withdrawalReference,
          }).orFail();
          return WalletProjectionOperation.collection.updateOne({
            operationReference: withdrawal.projectionReference,
          }, { $set: { "deltas.reservedBalance": 1 } });
        },
      },
      {
        name: "wrong Wallet owner",
        mutate: (fixture) => Wallet.collection.updateOne(
          { _id: fixture.creatorWallet._id },
          { $set: { userId: new Types.ObjectId() } },
        ),
      },
      {
        name: "wrong Wallet currency",
        mutate: (fixture) => Wallet.collection.updateOne(
          { _id: fixture.creatorWallet._id }, { $set: { currency: "USD" } },
        ),
      },
    ];
    for (const corruption of corruptions) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createTerminalWithdrawalFixture(
          server.baseUrl, WithdrawalProviderExecutionOutcome.SUCCESS,
        );
        await corruption.mutate(fixture);
        await assert.rejects(creatorWithdrawalFinalizationService.finalize(
          fixture.withdrawal.withdrawalReference,
        ), isPhase9DError, corruption.name);
        const state = await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        );
        assert.equal(state.ledgerCount, 0, corruption.name);
        assert.equal(state.projectionCount, 0, corruption.name);
        assert.equal(state.auditCount, 0, corruption.name);
      } finally {
        await server.close();
      }
    }
  });

  test("phase9d terminal Ledger, projection, metadata, and audit corruption fail replay", async () => {
    const corruptions = [
      "Ledger account/direction conflict",
      "projection delta conflict",
      "partial terminal metadata",
      "finalization transaction conflict",
      "terminal audit missing",
      "completed withdrawal with failure Ledger",
    ];
    for (const corruption of corruptions) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createTerminalWithdrawalFixture(
          server.baseUrl, WithdrawalProviderExecutionOutcome.SUCCESS,
        );
        await creatorWithdrawalFinalizationService.finalize(
          fixture.withdrawal.withdrawalReference,
        );
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationTransactionId " +
          "+finalizationProjectionOperationReference").orFail();
        if (corruption === "Ledger account/direction conflict") {
          await LedgerEntry.collection.updateOne({
            transactionId: withdrawal.finalizationTransactionId,
            account: LedgerAccount.PAYOUT_CLEARING,
          }, { $set: { account: LedgerAccount.WALLET_AVAILABLE } });
        } else if (corruption === "projection delta conflict") {
          await WalletProjectionOperation.collection.updateOne({
            operationReference:
              withdrawal.finalizationProjectionOperationReference,
          }, { $set: { "deltas.availableBalance": 1 } });
        } else if (corruption === "partial terminal metadata") {
          await CreatorWithdrawalRequest.collection.updateOne({
            _id: withdrawal._id,
          }, { $unset: { finalizationFingerprint: "" } });
        } else if (corruption === "finalization transaction conflict") {
          await CreatorWithdrawalRequest.collection.updateOne({
            _id: withdrawal._id,
          }, { $set: { finalizationTransactionId: "conflicting-transaction" } });
        } else if (corruption === "terminal audit missing") {
          await AuditLog.deleteOne({
            action: AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
          });
        } else {
          await LedgerEntry.collection.updateMany({
            transactionId: withdrawal.finalizationTransactionId,
          }, { $set: {
            type: LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED,
          } });
        }
        await assert.rejects(
          creatorWithdrawalFinalizationService.validateReplay(
            fixture.withdrawal.withdrawalReference,
          ), isPhase9DError, corruption,
        );
      } finally {
        await server.close();
      }
    }
  });

  test("phase9d failed withdrawal with success Ledger fails replay", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createTerminalWithdrawalFixture(
        server.baseUrl, WithdrawalProviderExecutionOutcome.FAILURE,
      );
      await creatorWithdrawalFinalizationService.finalize(
        fixture.withdrawal.withdrawalReference,
      );
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).select("+finalizationTransactionId").orFail();
      await LedgerEntry.collection.updateMany({
        transactionId: withdrawal.finalizationTransactionId,
      }, { $set: { type: LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED } });
      await assert.rejects(
        creatorWithdrawalFinalizationService.validateReplay(
          fixture.withdrawal.withdrawalReference,
        ), isPhase9DError,
      );
    } finally {
      await server.close();
    }
  });
};
