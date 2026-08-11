import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  WithdrawalProviderExecutionService,
  WithdrawalProviderExecutionStage,
} from "../../../services/financial/withdrawalProviderExecution.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createInitializedWithdrawalProviderFixture,
  snapshotPhase9CFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderExecutionFixtures";

export const registerWithdrawalProviderExecutionFailureTests = () => {
  test("phase9c every injected execution interruption rolls back all Phase 9C changes", async () => {
    const stages: WithdrawalProviderExecutionStage[] = [
      "BEFORE_PROCESSING",
      "AFTER_PROCESSING",
      "BEFORE_TERMINAL_STATE",
      "AFTER_TERMINAL_STATE",
      "BEFORE_AUDIT",
      "BEFORE_COMMIT",
    ];
    for (const stage of stages) {
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture =
          await createInitializedWithdrawalProviderFixture(server.baseUrl);
        const before = await snapshotPhase9CFinancialState(
          fixture.creatorWallet._id,
        );
        const service = new WithdrawalProviderExecutionService((current) => {
          if (current === stage) throw new Error(`PHASE9C_${stage}`);
        });
        await assert.rejects(service.execute({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
          outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
        }));
        const provider = await InternalWithdrawalProviderRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        assert.equal(provider.providerStatus, "INITIALIZED");
        assert.equal(provider.version, 1);
        assert.equal(provider.executionReference, undefined);
        assert.equal(provider.processingAt, undefined);
        assert.equal(provider.isTerminal, false);
        assert.equal(await InternalProviderEventModel.countDocuments({
          entityType: "WITHDRAWAL_PROVIDER_REQUEST",
        }), 2);
        assert.equal(await AuditLog.countDocuments({
          action: {
            $in: [
              AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
              AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
              AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
            ],
          },
        }), 0);
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        assert.equal(withdrawal.status, "RESERVED");
        assert.equal(withdrawal.reservedAmount, withdrawal.amount);
        assert.equal(withdrawal.providerTerminalStatus, undefined);
        assert.deepEqual(await snapshotPhase9CFinancialState(
          fixture.creatorWallet._id,
        ), before);
      } finally {
        await server.close();
        await clearPhase7HDatabase();
      }
    }
  });
};
