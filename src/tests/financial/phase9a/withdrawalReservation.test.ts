import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalRequestService } from "../../../services/financial/creatorWithdrawalRequest.service";
import {
  createEligibleCreatorWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalReservationTests = () => {
  test("phase9a reserves Creator Wallet funds with one balanced Ledger transaction", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      const walletBefore =
        await Wallet.findById(fixture.creatorWallet._id).orFail();
      const result = await creatorWithdrawalRequestService.request(fixture.input);
      assert.equal(result.status, "RESERVED");
      assert.equal(result.amount, 300);
      assert.equal(result.reservedAmount, 300);
      assert.equal(result.replay, false);
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 1);
      const entries = await LedgerEntry.find({
        transactionId:
          `creator-withdrawal-reservation:${result.withdrawalReference}`,
      });
      assert.equal(entries.length, 2);
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.DEBIT &&
        entry.account === LedgerAccount.WALLET_AVAILABLE));
      assert.ok(entries.some((entry) =>
        entry.direction === MoneyDirection.CREDIT &&
        entry.account === LedgerAccount.WITHDRAWAL_RESERVED));
      assert.equal(
        entries.filter((entry) => entry.direction === MoneyDirection.DEBIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
        entries.filter((entry) => entry.direction === MoneyDirection.CREDIT)
          .reduce((sum, entry) => sum + entry.amount, 0),
      );
      const projection = await WalletProjectionOperation.findOne({
        operationReference: result.projectionReference,
      }).orFail();
      assert.deepEqual({
        availableBalance: projection.deltas.availableBalance,
        reservedBalance: projection.deltas.reservedBalance,
        lockedBalance: projection.deltas.lockedBalance,
      }, {
        availableBalance: -300,
        reservedBalance: 300,
        lockedBalance: 0,
      });
      const walletAfter =
        await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(
        walletAfter.availableBalance,
        walletBefore.availableBalance - 300,
      );
      assert.equal(
        walletAfter.reservedBalance,
        walletBefore.reservedBalance + 300,
      );
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
