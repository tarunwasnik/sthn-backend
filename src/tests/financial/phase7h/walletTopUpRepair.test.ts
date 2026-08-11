import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletTopUpRequest } from "../../../models/walletTopUpRequest.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { WalletTopUpRepairOperation } from "../../../models/walletTopUpRepairOperation.model";
import { WalletTopUpOperationalAudit } from "../../../models/walletTopUpOperationalAudit.model";
import { WalletTopUpOperationalAction } from "../../../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpReconciliationErrorCode } from "../../../errors/financial/WalletTopUpReconciliationError";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { walletTopUpRepairService } from "../../../services/financial/walletTopUpRepair.service";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  reloadRequest,
} from "./fixtures/topUpFixtures";

const completedWithMissingLedgerLink = async (amount: number) => {
  const actors = await createActors();
  const { request } = await createFundedTopUp(actors, amount);
  await completeFundedTopUp(request.topUpReference);
  await WalletTopUpRequest.collection.updateOne(
    { _id: request._id },
    { $unset: { ledgerEntryId: "", ledgerReference: "" } },
  );
  const inspected = await walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
  return { actors, request, inspected };
};

export const registerRepairTests = () => {
  test("phase7h repair: missing links are repaired once and exact replay is idempotent", async () => {
    const { actors, request, inspected } = await completedWithMissingLedgerLink(710);
    const beforeWallet = await Wallet.findById(actors.wallet._id);
    const first = await walletTopUpRepairService.repair(
      inspected.reconciliation.reconciliationReference,
      WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
      actors.adminId.toString(),
    );
    const repaired = await reloadRequest(request.topUpReference);
    const replay = await walletTopUpRepairService.repair(
      inspected.reconciliation.reconciliationReference,
      WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
      actors.adminId.toString(),
    );
    const afterWallet = await Wallet.findById(actors.wallet._id);
    assert.ok(repaired.ledgerEntryId);
    assert.ok(repaired.ledgerReference);
    assert.equal(beforeWallet?.availableBalance, afterWallet?.availableBalance);
    assert.equal(await WalletTopUpRepairOperation.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
      action: WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
    }), 1);
    assert.equal(first.repair.operationReference, replay.repair.operationReference);
    assert.equal(await WalletTopUpOperationalAudit.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
      reasonCode: "REPAIR_APPLIED",
    }), 1);
  });

  test("phase7h repair: stale snapshot rejects without changing links or money", async () => {
    const { actors, request, inspected } = await completedWithMissingLedgerLink(720);
    await WalletTopUpRequest.collection.updateOne(
      { _id: request._id },
      { $set: { accountingTransactionId: "TUA-STALE-SNAPSHOT" } },
    );
    const walletBefore = await Wallet.findById(actors.wallet._id);
    await assert.rejects(
      () => walletTopUpRepairService.repair(
        inspected.reconciliation.reconciliationReference,
        WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
        actors.adminId.toString(),
      ),
      (error: unknown) => {
        assert.equal(
          (error as { code?: string }).code,
          WalletTopUpReconciliationErrorCode.SNAPSHOT_CONFLICT,
        );
        return true;
      },
    );
    const unchanged = await reloadRequest(request.topUpReference);
    assert.equal(unchanged.ledgerEntryId, undefined);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, walletBefore?.availableBalance);
    assert.equal(await WalletTopUpRepairOperation.countDocuments({}), 0);
  });

  test("phase7h repair: concurrent identical repairs converge to one operation", { timeout: 60_000 }, async () => {
    const { actors, request, inspected } = await completedWithMissingLedgerLink(730);
    const settled = await Promise.allSettled(Array.from({ length: 8 }, () =>
      walletTopUpRepairService.repair(
        inspected.reconciliation.reconciliationReference,
        WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
        actors.adminId.toString(),
      )));
    assert.ok(settled.some((item) => item.status === "fulfilled"));
    assert.equal(await WalletTopUpRepairOperation.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
    }), 1);
    assert.ok((await reloadRequest(request.topUpReference)).ledgerEntryId);
    assert.equal(await WalletTopUpOperationalAudit.countDocuments({
      reconciliationReference: inspected.reconciliation.reconciliationReference,
      reasonCode: "REPAIR_APPLIED",
    }), 1);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 730);
  });

  for (const corruption of ["LEDGER_AMOUNT", "PROJECTION_DELTA", "WALLET_OWNER", "CONFLICTING_LINK"] as const) {
    test(`phase7h repair forbidden: ${corruption} cannot be repaired`, async () => {
      const { actors, request, inspected } = await completedWithMissingLedgerLink(740);
      const completed = await reloadRequest(request.topUpReference);
      if (corruption === "LEDGER_AMOUNT") {
        const ledger = await LedgerEntry.findOne({ "metadata.topUpReference": request.topUpReference });
        assert.ok(ledger);
        await LedgerEntry.collection.updateOne(
          { _id: ledger._id }, { $set: { amount: 741 } },
        );
      } else if (corruption === "PROJECTION_DELTA") {
        await WalletProjectionOperation.collection.updateOne(
          { _id: completed.walletProjectionOperationId },
          { $set: { "deltas.availableBalance": 741 } },
        );
      } else if (corruption === "WALLET_OWNER") {
        await Wallet.collection.updateOne(
          { _id: actors.wallet._id }, { $set: { userId: new Types.ObjectId() } },
        );
      } else {
        await WalletTopUpRequest.collection.updateOne(
          { _id: request._id }, { $set: { ledgerEntryId: new Types.ObjectId() } },
        );
      }
      await walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
      await assert.rejects(() => walletTopUpRepairService.repair(
        inspected.reconciliation.reconciliationReference,
        WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
        actors.adminId.toString(),
      ));
      assert.equal(await WalletTopUpRepairOperation.countDocuments({}), 0);
    });
  }
};
