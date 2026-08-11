import assert from "node:assert/strict";
import { test } from "node:test";

import { CreatorWithdrawalOperationalAction as Action } from
  "../../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalReconciliation } from
  "../../../models/creatorWithdrawalReconciliation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../models/creatorWithdrawalRetryAttempt.model";
import {
  CreatorWithdrawalFinalizationRetryService,
} from "../../../services/financial/creatorWithdrawalFinalizationRetry.service";
import {
  CreatorWithdrawalReconciliationService,
} from "../../../services/financial/creatorWithdrawalReconciliation.service";
import { CreatorWithdrawalRepairService } from
  "../../../services/financial/creatorWithdrawalRepair.service";
import { creatorWithdrawalOperationalInspectionService } from
  "../../../services/financial/creatorWithdrawalOperationalInspection.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createHealthyWithdrawalFixture,
  createPendingFinalizationFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalOperationalFailureTests = () => {
  test("phase9e reconciliation authority and audit interruptions roll back", async () => {
    for (const stage of ["AFTER_RECONCILIATION_AUTHORITY",
      "BEFORE_RECONCILIATION_AUDIT", "BEFORE_OPERATIONAL_COMMIT"] as const) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createPendingFinalizationFixture(server.baseUrl,
          Outcome.SUCCESS);
        const service = new CreatorWithdrawalReconciliationService((current) => {
          if (current === stage) throw new Error(stage);
        });
        await assert.rejects(service.inspect(
          fixture.withdrawal.withdrawalReference,
          fixture.fixture.actors.adminId.toString()));
        assert.equal(await CreatorWithdrawalReconciliation.countDocuments(), 0);
      } finally { await server.close(); }
    }
  });

  test("phase9e post-Phase-9D operational failure never rolls back accounting", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createPendingFinalizationFixture(server.baseUrl,
        Outcome.SUCCESS);
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await new CreatorWithdrawalReconciliationService()
        .inspect(fixture.withdrawal.withdrawalReference, adminId);
      const retry = new CreatorWithdrawalFinalizationRetryService((stage) => {
        if (stage === "BEFORE_POST_FINALIZATION_UPDATE") throw new Error(stage);
      });
      await assert.rejects(retry.retry(reconciliation.reconciliationReference,
        adminId));
      const inspection = await creatorWithdrawalOperationalInspectionService.inspect(
        fixture.withdrawal.withdrawalReference);
      assert.equal(inspection.classification, "HEALTHY_COMPLETED");
      assert.equal(await CreatorWithdrawalRetryAttempt.countDocuments(), 1);
    } finally { await server.close(); }
  });

  test("phase9e repair interruptions roll back metadata and operation", async () => {
    for (const stage of ["AFTER_REPAIR_OPERATION_CREATION",
      "BEFORE_GUARDED_METADATA_REPAIR", "BEFORE_REPAIR_AUDIT",
      "BEFORE_OPERATIONAL_COMMIT"] as const) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
          Outcome.SUCCESS);
        await CreatorWithdrawalRequest.collection.updateOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }, { $set: { finalizationLedgerEntryIds: [] } });
        const adminId = fixture.fixture.actors.adminId.toString();
        const reconciliation = await new CreatorWithdrawalReconciliationService()
          .inspect(fixture.withdrawal.withdrawalReference, adminId);
        const repair = new CreatorWithdrawalRepairService((current) => {
          if (current === stage) throw new Error(stage);
        });
        await assert.rejects(repair.repair(reconciliation.reconciliationReference,
          Action.RESTORE_FINALIZATION_LINKS, adminId));
        assert.equal(await CreatorWithdrawalRepairOperation.countDocuments(), 0);
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationLedgerEntryIds").orFail();
        assert.equal(withdrawal.finalizationLedgerEntryIds.length, 0);
      } finally { await server.close(); }
    }
  });
};
