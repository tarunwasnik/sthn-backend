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
import { creatorWithdrawalFinalizationService } from
  "../../../services/financial/creatorWithdrawalFinalization.service";
import {
  createTerminalWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalFailureFinalizationTests = () => {
  test("phase9d releases a failed provider reservation exactly once", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createTerminalWithdrawalFixture(
        server.baseUrl,
        WithdrawalProviderExecutionOutcome.FAILURE,
      );
      const before = await Wallet.findById(fixture.creatorWallet._id).orFail();
      const result = await creatorWithdrawalFinalizationService.finalize(
        fixture.withdrawal.withdrawalReference,
      );
      assert.equal(result.status, "FAILED");
      assert.equal(result.outcome, "FAILED");
      const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(wallet.availableBalance,
        before.availableBalance + fixture.withdrawal.amount);
      assert.equal(wallet.reservedBalance,
        before.reservedBalance - fixture.withdrawal.amount);
      assert.equal(wallet.currentBalance, before.currentBalance);
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).select("+finalizationTransactionId +providerFailureCode").orFail();
      assert.equal(withdrawal.status, "FAILED");
      assert.equal(withdrawal.providerFailureCode, "BANK_NETWORK_FAILURE");
      const entries = await LedgerEntry.find({
        transactionId: withdrawal.finalizationTransactionId,
      });
      assert.equal(entries.length, 2);
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.DEBIT &&
        entry.account === LedgerAccount.WITHDRAWAL_RESERVED));
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.CREDIT &&
        entry.account === LedgerAccount.WALLET_AVAILABLE));
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_FAILED,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
