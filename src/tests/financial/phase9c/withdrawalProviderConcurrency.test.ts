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
import { WithdrawalProviderExecutionService } from
  "../../../services/financial/withdrawalProviderExecution.service";
import { providerSimulatorService } from
  "../../../services/providerSimulator/providerSimulator.service";
import {
  createInitializedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderExecutionFixtures";

export const registerWithdrawalProviderExecutionConcurrencyTests = () => {
  test("phase9c ten concurrent execution attempts converge on one provider result", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createInitializedWithdrawalProviderFixture(server.baseUrl);
      let executions = 0;
      const service = new WithdrawalProviderExecutionService(
        () => undefined,
        (input) => {
          executions += 1;
          return providerSimulatorService.simulateWithdrawalProvider(input);
        },
      );
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () => service.execute({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
          outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
        })),
      );
      assert.ok(attempts.every((attempt) => attempt.status === "fulfilled"),
        attempts.map((attempt) => attempt.status === "fulfilled"
          ? "fulfilled" : String(attempt.reason)).join(" | "));
      assert.equal(executions, 1);
      assert.equal(await InternalWithdrawalProviderRequest.countDocuments({
        providerStatus: "SUCCEEDED",
      }), 1);
      assert.equal(await InternalProviderEventModel.countDocuments({
        entityType: "WITHDRAWAL_PROVIDER_REQUEST",
      }), 4);
      assert.equal(await AuditLog.countDocuments({
        action: {
          $in: [
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
            AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
          ],
        },
      }), 2);
    } finally {
      await server.close();
    }
  });
};
