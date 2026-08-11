import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../models/auditLog.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  WithdrawalProviderExecutionService,
  withdrawalProviderExecutionService,
} from "../../../services/financial/withdrawalProviderExecution.service";
import {
  createInitializedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderExecutionFixtures";

export const registerWithdrawalProviderExecutionReplayTests = () => {
  test("phase9c terminal replay never duplicates provider execution, events, or audits", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createInitializedWithdrawalProviderFixture(server.baseUrl);
      const input = {
        withdrawalReference: fixture.withdrawal.withdrawalReference,
        outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
      };
      const first = await withdrawalProviderExecutionService.execute(input);
      const second = await new WithdrawalProviderExecutionService()
        .execute(input);
      const validated = await withdrawalProviderExecutionService
        .validateReplay(input.withdrawalReference, input.outcome);
      assert.equal(first.executionReference, second.executionReference);
      assert.equal(second.replay, true);
      assert.equal(validated.replay, true);
      assert.equal(await InternalWithdrawalProviderRequest.countDocuments(), 1);
      assert.equal(await InternalProviderEventModel.countDocuments({
        entityType: "WITHDRAWAL_PROVIDER_REQUEST",
      }), 4);
      assert.equal(await AuditLog.countDocuments({
        action: {
          $in: [
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
          ],
        },
      }), 3);
      await assert.rejects(
        withdrawalProviderExecutionService.execute({
          ...input,
          outcome: WithdrawalProviderExecutionOutcome.FAILURE,
        }),
        (error: { code?: string }) =>
          error.code === "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH",
      );
    } finally {
      await server.close();
    }
  });
};
