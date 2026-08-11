import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { CreatorWithdrawalOperationalAction as Action } from
  "../../../enums/financial/creatorWithdrawalOperationalAction.enum";
import { WithdrawalProviderExecutionOutcome as Outcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { creatorWithdrawalReconciliationService } from
  "../../../services/financial/creatorWithdrawalReconciliation.service";
import {
  createHealthyWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalOperationalFixtures";

export const registerWithdrawalOperationalAuditTests = () => {
  test("phase9e acknowledgement and resolution are guarded and audited", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture = await createHealthyWithdrawalFixture(server.baseUrl,
        Outcome.SUCCESS);
      const adminId = fixture.fixture.actors.adminId.toString();
      const reconciliation = await creatorWithdrawalReconciliationService.inspect(
        fixture.withdrawal.withdrawalReference, adminId,
      );
      const acknowledged = await creatorWithdrawalReconciliationService.updateStatus({
        reconciliationReference: reconciliation.reconciliationReference,
        action: Action.ACKNOWLEDGE, resolutionCode: "REVIEWED", adminUserId: adminId,
      });
      assert.equal(acknowledged.status, "ACKNOWLEDGED");
      const resolved = await creatorWithdrawalReconciliationService.updateStatus({
        reconciliationReference: reconciliation.reconciliationReference,
        action: Action.RESOLVE, resolutionCode: "GRAPH_HEALTHY",
        resolutionNote: "Authoritative replay passed.", adminUserId: adminId,
      });
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(await AuditLog.countDocuments({ action: { $in: [
        AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_ACKNOWLEDGED,
        AuditAction.CREATOR_WITHDRAWAL_RECONCILIATION_RESOLVED,
      ] } }), 2);
      await assert.rejects(creatorWithdrawalReconciliationService.updateStatus({
        reconciliationReference: reconciliation.reconciliationReference,
        action: Action.RESOLVE, resolutionCode: "AGAIN", adminUserId: adminId,
      }), (error: { code?: string }) =>
        error.code === "CREATOR_WITHDRAWAL_OPERATIONAL_ALREADY_RESOLVED");
    } finally { await server.close(); }
  });
};
