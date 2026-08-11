import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderEventType } from "../../../constants/internalProvider";
import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../../enums/financial/moneyDirection.enum";
import { AuditLog } from "../../../models/auditLog.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { createSuccessfulMarketplaceFlow } from
  "./fixtures/marketplaceFixtures";

const balance = (
  entries: Awaited<ReturnType<typeof LedgerEntry.find>>,
  account: LedgerAccount,
) => entries.filter((entry) => entry.account === account)
  .reduce((sum, entry) => sum + (entry.direction === MoneyDirection.CREDIT
    ? entry.amount : -entry.amount), 0);

export const registerMarketplaceFinancialIntegrityTests = () => {
  test("phase10a Ledger, projections, liabilities, and audits reconcile", async () => {
    const flow = await createSuccessfulMarketplaceFlow();
    try {
      const entries = await LedgerEntry.find().select("+postingKey");
      assert.equal(entries.length, 15);
      const postingKeys = entries.map((entry) => entry.postingKey)
        .filter((value): value is string => !!value);
      assert.equal(new Set(postingKeys).size, postingKeys.length);

      const byTransaction = new Map<string, typeof entries>();
      for (const entry of entries) {
        byTransaction.set(entry.transactionId,
          [...(byTransaction.get(entry.transactionId) ?? []), entry]);
      }
      for (const transactionEntries of byTransaction.values()) {
        if (transactionEntries.every((entry) =>
          entry.source === LedgerSource.INTERNAL_TOP_UP_FUNDING)) {
          assert.equal(transactionEntries.length, 1);
          assert.equal(transactionEntries[0].direction, MoneyDirection.CREDIT);
          assert.equal(transactionEntries[0].amount, 2_000);
          continue;
        }
        const debits = transactionEntries.filter((entry) =>
          entry.direction === MoneyDirection.DEBIT)
          .reduce((sum, entry) => sum + entry.amount, 0);
        const credits = transactionEntries.filter((entry) =>
          entry.direction === MoneyDirection.CREDIT)
          .reduce((sum, entry) => sum + entry.amount, 0);
        assert.equal(debits, credits);
      }
      const sourceCounts = new Map<string, number>();
      for (const entry of entries) sourceCounts.set(entry.source,
        (sourceCounts.get(entry.source) ?? 0) + 1);
      assert.deepEqual(Object.fromEntries(sourceCounts), {
        INTERNAL_TOP_UP_FUNDING: 1,
        BOOKING_WALLET_AUTHORIZATION: 2,
        BOOKING_WALLET_CAPTURE: 2,
        BOOKING_ESCROW_ALLOCATION: 4,
        BOOKING_CREATOR_WALLET_SETTLEMENT: 2,
        CREATOR_WITHDRAWAL_RESERVATION: 2,
        WITHDRAWAL_PROVIDER_FINALIZATION: 2,
      });
      assert.ok(entries.every((entry) => !!entry.bookingId ||
        typeof entry.metadata?.topUpReference === "string" ||
        typeof entry.metadata?.withdrawalReference === "string"));

      assert.equal(balance(entries, LedgerAccount.PLATFORM_ESCROW), 0);
      assert.equal(balance(entries,
        LedgerAccount.PLATFORM_COMMISSION_PAYABLE), 200);
      assert.equal(balance(entries,
        LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE), 50);
      assert.equal(balance(entries, LedgerAccount.CREATOR_PAYABLE), 0);
      assert.equal(balance(entries, LedgerAccount.WITHDRAWAL_RESERVED), 0);
      assert.equal(balance(entries, LedgerAccount.PAYOUT_CLEARING), 800);

      const projections = await WalletProjectionOperation.find();
      assert.equal(projections.length, 6);
      const ledgerIds = new Set(entries.map((entry) => entry._id.toString()));
      assert.ok(projections.every((operation) =>
        operation.ledgerEntryIds.length > 0 &&
        operation.ledgerEntryIds.every((id) => ledgerIds.has(id.toString()))));
      for (const [walletId, expected] of [
        [flow.actors.wallet._id.toString(), [950, 0, 0, 950]],
        [flow.creatorWallet._id.toString(), [0, 0, 0, 0]],
      ] as const) {
        const owned = projections.filter((item) =>
          item.walletId.toString() === walletId);
        const sums = owned.reduce((state, item) => [
          state[0] + item.deltas.availableBalance,
          state[1] + item.deltas.reservedBalance,
          state[2] + item.deltas.lockedBalance,
        ], [0, 0, 0]);
        const wallet = await Wallet.findById(walletId).orFail();
        assert.deepEqual([...sums, sums[0] + sums[1] + sums[2]], expected);
        assert.deepEqual([wallet.availableBalance, wallet.reservedBalance,
          wallet.lockedBalance, wallet.currentBalance], expected);
      }

      const auditActions = [
        AuditAction.BOOKING_WALLET_RESERVATION_CAPTURED,
        AuditAction.BOOKING_ESCROW_ALLOCATED,
        AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
        AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
        AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
        AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
        AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
        AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_CREATED,
      ];
      for (const action of auditActions) assert.equal(
        await AuditLog.countDocuments({ action }), 1,
      );
      for (const eventType of [
        ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
        ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
        ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING,
        ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED,
      ]) assert.equal(await InternalProviderEventModel.countDocuments({
        eventType,
      }), 1);
    } finally { await flow.server.close(); }
  });
};
