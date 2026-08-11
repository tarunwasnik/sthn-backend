import assert from "node:assert/strict";
import { test } from "node:test";

import { CreatorProfile } from "../../../models/creatorProfile.model";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from "../../../models/creatorWithdrawalRequest.model";
import { PayoutDestination } from "../../../models/payoutDestination.model";
import { Wallet } from "../../../models/wallet.model";
import { creatorWithdrawalRequestService } from "../../../services/financial/creatorWithdrawalRequest.service";
import {
  createEligibleCreatorWithdrawalFixture,
  postCreatorWithdrawal,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalEligibilityTests = () => {
  test("phase9a endpoint derives ownership and rejects unauthenticated or client identity fields", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      const body = {
        amount: fixture.input.amount.amount,
        currency: fixture.input.amount.currency,
        destinationReference: fixture.input.destinationReference,
        idempotencyKey: fixture.input.idempotencyKey,
      };
      assert.equal((await postCreatorWithdrawal(
        server.baseUrl,
        undefined,
        body,
      )).status, 401);
      assert.equal((await postCreatorWithdrawal(
        server.baseUrl,
        fixture.creatorToken,
        { ...body, walletId: fixture.creatorWallet._id.toString() },
      )).status, 400);
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 0);
    } finally {
      await server.close();
    }
  });

  test("phase9a enforces balance, active Creator, Wallet lock, and one active withdrawal", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const insufficient =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      await assert.rejects(creatorWithdrawalRequestService.request({
        ...insufficient.input,
        amount: { amount: 901, currency: "INR" },
      }));
      await CreatorProfile.updateOne(
        { userId: insufficient.fixture.actors.creatorId },
        { $set: { status: "inactive" } },
      );
      await assert.rejects(
        creatorWithdrawalRequestService.request(insufficient.input),
      );
      await CreatorProfile.updateOne(
        { userId: insufficient.fixture.actors.creatorId },
        { $set: { status: "active" } },
      );
      await Wallet.updateOne(
        { _id: insufficient.creatorWallet._id },
        {
          $inc: {
            availableBalance: -1,
            lockedBalance: 1,
          },
        },
      );
      await assert.rejects(
        creatorWithdrawalRequestService.request(insufficient.input),
      );
      await Wallet.updateOne(
        { _id: insufficient.creatorWallet._id },
        {
          $inc: {
            availableBalance: 1,
            lockedBalance: -1,
          },
        },
      );
      await creatorWithdrawalRequestService.request(insufficient.input);
      await assert.rejects(creatorWithdrawalRequestService.request({
        ...insufficient.input,
        idempotencyKey: `${insufficient.input.idempotencyKey}-second`,
      }));
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 1);
    } finally {
      await server.close();
    }
  });

  test("phase9a rejects inactive destination, currency mismatch, and unhealthy settlement integrity", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      await PayoutDestination.updateOne(
        { _id: fixture.destination._id },
        { $set: { isActive: false } },
      );
      await assert.rejects(
        creatorWithdrawalRequestService.request(fixture.input),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CREATOR_WITHDRAWAL_DESTINATION_MISSING",
      );
      await PayoutDestination.updateOne(
        { _id: fixture.destination._id },
        { $set: { isActive: true } },
      );
      await assert.rejects(
        creatorWithdrawalRequestService.request({
          ...fixture.input,
          amount: { amount: 300, currency: "USD" },
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CREATOR_WITHDRAWAL_CURRENCY_MISMATCH",
      );
      await AuditLog.deleteOne({
        action: "BOOKING_CREATOR_WALLET_SETTLED",
        entityId: fixture.settlement._id,
      });
      await assert.rejects(
        creatorWithdrawalRequestService.request(fixture.input),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT",
      );
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 0);
    } finally {
      await server.close();
    }
  });
};
