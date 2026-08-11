import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalFinalizationService } from
  "../../../services/financial/creatorWithdrawalFinalization.service";
import {
  createTerminalWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalCompletionTests = () => {
  test("phase9d consumes a successful provider reservation exactly once", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createTerminalWithdrawalFixture(
        server.baseUrl,
        WithdrawalProviderExecutionOutcome.SUCCESS,
      );
      const before = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const result = await creatorWithdrawalFinalizationService.finalize(
        fixture.withdrawal.withdrawalReference,
      );
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.outcome, "COMPLETED");
      assert.equal(result.replay, false);
      const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(wallet.availableBalance, before.availableBalance);
      assert.equal(wallet.reservedBalance,
        before.reservedBalance - fixture.withdrawal.amount);
      assert.equal(wallet.currentBalance,
        before.currentBalance - fixture.withdrawal.amount);
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).select("+finalizationLedgerEntryIds +finalizationTransactionId " +
        "+finalizationProjectionOperationReference")
        .orFail();
      assert.equal(withdrawal.status, "COMPLETED");
      assert.equal(withdrawal.reservedAmount, 0);
      assert.ok(withdrawal.completedAt);
      const entries = await LedgerEntry.find({
        transactionId: withdrawal.finalizationTransactionId,
      });
      assert.equal(entries.length, 2);
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.DEBIT &&
        entry.account === LedgerAccount.WITHDRAWAL_RESERVED));
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.CREDIT &&
        entry.account === LedgerAccount.PAYOUT_CLEARING && !entry.walletId));
      const projection = await WalletProjectionOperation.findOne({
        operationReference:
          withdrawal.finalizationProjectionOperationReference,
      }).orFail();
      assert.equal(projection.deltas.availableBalance, 0);
      assert.equal(projection.deltas.reservedBalance,
        -fixture.withdrawal.amount);
      assert.equal(projection.deltas.lockedBalance, 0);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
