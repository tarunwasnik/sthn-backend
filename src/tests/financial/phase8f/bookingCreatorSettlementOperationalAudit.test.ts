import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementRepairAction as RepairAction } from "../../../enums/financial/bookingCreatorSettlementReconciliation.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingCreatorSettlementReconciliation } from "../../../models/bookingCreatorSettlementReconciliation.model";
import { BookingCreatorSettlementRepairOperation } from "../../../models/bookingCreatorSettlementRepairOperation.model";
import { BookingCreatorSettlementRetryAttempt } from "../../../models/bookingCreatorSettlementRetryAttempt.model";
import { Wallet } from "../../../models/wallet.model";
import { bookingCreatorSettlementReconciliationService } from "../../../services/financial/bookingCreatorSettlementReconciliation.service";
import { bookingCreatorSettlementRepairService } from "../../../services/financial/bookingCreatorSettlementRepair.service";
import { bookingCreatorSettlementRetryService } from "../../../services/financial/bookingCreatorSettlementRetry.service";
import {
  createSettledOperationalFixture,
  startOperationalHttpServer,
} from "./fixtures/bookingCreatorSettlementOperationalFixtures";

export const registerBookingCreatorSettlementOperationalAuditTests = () => {
  test("phase8f reconciliation audit failure rolls back its authority", async () => {
    const server = await startOperationalHttpServer();
    const model = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = model.create;
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      model.create = (async () => {
        throw new Error("controlled reconciliation audit failure");
      }) as typeof AuditLog.create;
      await assert.rejects(
        bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        ),
      );
      assert.equal(await BookingCreatorSettlementReconciliation.countDocuments(), 0);
    } finally {
      model.create = original;
      await server.close();
    }
  });

  test("phase8f retry audit failure rolls back retry and completion guard", async () => {
    const server = await startOperationalHttpServer();
    const model = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = model.create;
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await BookingCreatorSettlement.collection.updateOne({
        _id: fixture.settlement._id,
      }, { $set: { status: "PENDING" }, $unset: { settledAt: "" } });
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      model.create = (async () => {
        throw new Error("controlled retry audit failure");
      }) as typeof AuditLog.create;
      await assert.rejects(bookingCreatorSettlementRetryService.retry(
        reconciliation.reconciliationReference as string,
      ));
      assert.equal((await BookingCreatorSettlement.findById(
        fixture.settlement._id,
      ).orFail()).status, "PENDING");
      assert.equal(await BookingCreatorSettlementRetryAttempt.countDocuments(), 0);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      model.create = original;
      await server.close();
    }
  });

  test("phase8f repair operational-audit failure rolls back the complete repair", async () => {
    const server = await startOperationalHttpServer();
    const model = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = model.create;
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await AuditLog.deleteOne({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        entityId: fixture.settlement._id,
      });
      const reconciliation =
        await bookingCreatorSettlementReconciliationService.reconcile(
          fixture.settlement.settlementReference,
        );
      const walletBefore = await Wallet.findById(fixture.creatorWallet._id).orFail();
      let auditCreateCount = 0;
      model.create = (async (...args: any[]) => {
        auditCreateCount += 1;
        if (auditCreateCount === 2) {
          throw new Error("controlled repair operational-audit failure");
        }
        return (original as any).apply(model, args);
      }) as typeof AuditLog.create;
      await assert.rejects(bookingCreatorSettlementRepairService.repair(
        reconciliation.reconciliationReference as string,
        RepairAction.RESTORE_MISSING_AUDIT,
        fixture.fixture.actors.adminId.toString(),
      ));
      assert.equal(await BookingCreatorSettlementRepairOperation.countDocuments(), 0);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
        entityId: fixture.settlement._id,
      }), 0);
      const walletAfter = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(walletAfter.currentBalance, walletBefore.currentBalance);
      assert.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    } finally {
      model.create = original;
      await server.close();
    }
  });

  test("phase8f operational audit actions are bounded and use safe references", async () => {
    const server = await startOperationalHttpServer();
    try {
      const fixture = await createSettledOperationalFixture(server.baseUrl);
      await bookingCreatorSettlementReconciliationService.reconcile(
        fixture.settlement.settlementReference,
      );
      const audit = await AuditLog.findOne({
        action: AuditAction.BOOKING_CREATOR_SETTLEMENT_RECONCILED,
      }).orFail();
      assert.equal(audit.actorType, "SYSTEM");
      assert.equal(audit.financialContext?.domain, "BOOKING_WALLET");
      assert.equal(
        audit.financialContext?.settlementReference,
        fixture.settlement.settlementReference,
      );
      assert.equal(JSON.stringify(audit).includes("settlementFingerprint"), false);
    } finally {
      await server.close();
    }
  });
};
