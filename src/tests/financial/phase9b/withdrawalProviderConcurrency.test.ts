import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { withdrawalProviderInitializationService } from
  "../../../services/financial/withdrawalProviderInitialization.service";
import {
  createReservedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderInitializationFixtures";

export const registerWithdrawalProviderConcurrencyTests = () => {
  test("phase9b ten simultaneous initializations converge on one provider identity", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createReservedWithdrawalProviderFixture(server.baseUrl);
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          withdrawalProviderInitializationService.initialize(
            fixture.withdrawal.withdrawalReference,
          )),
      );
      assert.ok(attempts.every((attempt) => attempt.status === "fulfilled"),
        attempts.map((attempt) => attempt.status === "fulfilled"
          ? "fulfilled" : String(attempt.reason)).join(" | "));
      const identities = attempts.map((attempt) =>
        attempt.status === "fulfilled"
          ? `${attempt.value.providerRequestReference}:` +
            attempt.value.providerReference
          : "rejected");
      assert.equal(new Set(identities).size, 1);
      assert.equal(await InternalWithdrawalProviderRequest.countDocuments(), 1);
      assert.equal(await InternalProviderEventModel.countDocuments({
        entityType: "WITHDRAWAL_PROVIDER_REQUEST",
      }), 2);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
