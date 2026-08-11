import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  WithdrawalProviderInitializationService,
  WithdrawalProviderInitializationStage,
} from "../../../services/financial/withdrawalProviderInitialization.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createReservedWithdrawalProviderFixture,
  snapshotFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderInitializationFixtures";

export const registerWithdrawalProviderFailureTests = () => {
  test("phase9b every injected initialization interruption rolls back all Phase 9B effects", async () => {
    const stages: WithdrawalProviderInitializationStage[] = [
      "AFTER_PROVIDER_AUTHORITY",
      "AFTER_PROVIDER_EVENT",
      "BEFORE_INITIALIZATION",
      "BEFORE_AUDIT",
      "BEFORE_COMMIT",
    ];
    for (const stage of stages) {
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture =
          await createReservedWithdrawalProviderFixture(server.baseUrl);
        const before = await snapshotFinancialState(fixture.creatorWallet._id);
        const service = new WithdrawalProviderInitializationService(
          (current) => {
            if (current === stage) throw new Error(`PHASE9B_${stage}`);
          },
        );
        await assert.rejects(
          service.initialize(fixture.withdrawal.withdrawalReference),
        );
        assert.equal(
          await InternalWithdrawalProviderRequest.countDocuments(),
          0,
        );
        assert.equal(await InternalProviderEventModel.countDocuments({
          entityType: "WITHDRAWAL_PROVIDER_REQUEST",
        }), 0);
        assert.equal(await AuditLog.countDocuments({
          action: AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
        }), 0);
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        assert.equal(withdrawal.status, "RESERVED");
        assert.equal(withdrawal.reservedAmount, withdrawal.amount);
        assert.equal(withdrawal.providerRequestReference, undefined);
        assert.deepEqual(await snapshotFinancialState(
          fixture.creatorWallet._id,
        ), before);
      } finally {
        await server.close();
        await clearPhase7HDatabase();
      }
    }
  });
};
