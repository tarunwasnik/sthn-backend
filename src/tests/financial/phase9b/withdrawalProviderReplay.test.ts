import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  WithdrawalProviderInitializationService,
  withdrawalProviderInitializationService,
} from "../../../services/financial/withdrawalProviderInitialization.service";
import {
  createReservedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderInitializationFixtures";

export const registerWithdrawalProviderReplayTests = () => {
  test("phase9b replay regenerates identity and never duplicates authority, events, or audit", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createReservedWithdrawalProviderFixture(server.baseUrl);
      const reference = fixture.withdrawal.withdrawalReference;
      const first =
        await withdrawalProviderInitializationService.initialize(reference);
      const second =
        await new WithdrawalProviderInitializationService().initialize(
          reference,
        );
      const validated =
        await withdrawalProviderInitializationService.validateReplay(
          reference,
        );
      assert.equal(first.providerRequestReference,
        second.providerRequestReference);
      assert.equal(first.providerReference, validated.providerReference);
      assert.equal(second.replay, true);
      assert.equal(validated.replay, true);
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
