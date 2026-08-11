import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderEventType } from "../../../constants/internalProvider";
import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { withdrawalProviderInitializationService } from
  "../../../services/financial/withdrawalProviderInitialization.service";
import {
  createReservedWithdrawalProviderFixture,
  snapshotFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/withdrawalProviderInitializationFixtures";

export const registerWithdrawalProviderInitializationTests = () => {
  test("phase9b initializes one immutable provider authority without moving money", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createReservedWithdrawalProviderFixture(server.baseUrl);
      const before = await snapshotFinancialState(fixture.creatorWallet._id);
      const result = await withdrawalProviderInitializationService.initialize(
        fixture.withdrawal.withdrawalReference,
      );
      assert.equal(result.providerStatus, "INITIALIZED");
      assert.equal(result.replay, false);
      assert.match(result.providerRequestReference, /^IWPR-/);
      assert.match(result.providerReference ?? "", /^INTERNAL-WD-/);
      const authority =
        await InternalWithdrawalProviderRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+providerRequestKey +providerFingerprint").orFail();
      assert.equal(authority.version, 1);
      assert.match(authority.providerFingerprint, /^[a-f0-9]{64}$/);
      const withdrawal = await CreatorWithdrawalRequest.findOne({
        withdrawalReference: fixture.withdrawal.withdrawalReference,
      }).orFail();
      assert.equal(withdrawal.status, "RESERVED");
      assert.equal(withdrawal.reservedAmount, withdrawal.amount);
      assert.equal(
        withdrawal.providerRequestReference,
        authority.providerRequestReference,
      );
      assert.deepEqual(await snapshotFinancialState(
        fixture.creatorWallet._id,
      ), before);
      assert.equal(await InternalProviderEventModel.countDocuments({
        entityId: authority._id,
        eventType: {
          $in: [
            ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
            ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
          ],
        },
      }), 2);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
        entityId: authority._id,
      }), 1);
    } finally {
      await server.close();
    }
  });
};
