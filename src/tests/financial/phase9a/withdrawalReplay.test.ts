import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalRequestService } from "../../../services/financial/creatorWithdrawalRequest.service";
import {
  createEligibleCreatorWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalReplayTests = () => {
  test("phase9a sequential, reloaded, and validation replay preserve one reservation", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      const first = await creatorWithdrawalRequestService.request(fixture.input);
      const second = await creatorWithdrawalRequestService.request(fixture.input);
      const validated =
        await creatorWithdrawalRequestService.validateReplay(
          first.withdrawalReference,
        );
      assert.equal(first.withdrawalReference, second.withdrawalReference);
      assert.equal(first.withdrawalReference, validated.withdrawalReference);
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 1);
      assert.equal(await LedgerEntry.countDocuments({
        transactionId:
          `creator-withdrawal-reservation:${first.withdrawalReference}`,
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        operationReference: first.projectionReference,
      }), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
      }), 1);
    } finally {
      await server.close();
    }
  });

  test("phase9a reused request key with different immutable intent fails closed", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      await creatorWithdrawalRequestService.request(fixture.input);
      await assert.rejects(
        creatorWithdrawalRequestService.request({
          ...fixture.input,
          amount: { amount: 301, currency: "INR" },
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CREATOR_WITHDRAWAL_REPLAY_CONFLICT",
      );
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 1);
    } finally {
      await server.close();
    }
  });
};
