import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { UserProfile } from "../../../models/userProfile.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import {
  completeFundedTopUp,
  createFundedTopUp,
} from "../phase7h/fixtures/topUpFixtures";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

export const registerBookingCreatorSettlementWalletRaceTests = () => {
  test("phase8e settlement and outgoing reservation projection on one Wallet do not lose updates", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        { creatorWalletAmount: 500 },
      );
      const attempts = await Promise.allSettled([
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        walletProjectionService.applyProjectionMutation({
          userId: fixture.fixture.actors.creatorId,
          currency: "INR",
          operationKey: `phase8e-outgoing-reservation:${fixture.booking._id}`,
          deltas: { availableBalance: -600, reservedBalance: 600 },
          minimums: { availableBalance: 600 },
        }),
      ]);
      assert.equal(attempts[0].status, "fulfilled");
      const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
      if (attempts[1].status === "fulfilled") {
        assert.deepEqual([
          wallet.availableBalance,
          wallet.reservedBalance,
          wallet.lockedBalance,
          wallet.currentBalance,
        ], [700, 600, 0, 1_300]);
      } else {
        assert.deepEqual([
          wallet.availableBalance,
          wallet.reservedBalance,
          wallet.lockedBalance,
          wallet.currentBalance,
        ], [1_300, 0, 0, 1_300]);
      }
    } finally {
      await server.close();
    }
  });

  test("phase8e settlement and actual top-up accounting on one Wallet remain independent", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        { creatorWalletAmount: 100 },
      );
      await UserProfile.create({
        userId: fixture.fixture.actors.creatorId,
        username: `phase8e_creator_${fixture.booking._id}`,
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        interests: ["finance"],
        bio: "Phase 8E verified Creator user",
        avatar: "https://test.local/avatar",
        cover: "https://test.local/cover",
        profilePhotos: ["https://test.local/1", "https://test.local/2"],
        profileStatus: "verified",
      });
      const topUpActors = {
        userId: fixture.fixture.actors.creatorId as Types.ObjectId,
        creatorId: fixture.fixture.actors.creatorId as Types.ObjectId,
        adminId: fixture.fixture.actors.adminId as Types.ObjectId,
        wallet: fixture.creatorWallet,
      };
      const topUp = await createFundedTopUp(topUpActors, 300);
      const attempts = await Promise.allSettled([
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        completeFundedTopUp(topUp.request.topUpReference),
      ]);
      assert.ok(attempts.every((entry) => entry.status === "fulfilled"),
        attempts.map((entry) => entry.status === "fulfilled"
          ? "fulfilled"
          : String(entry.reason)).join(" | "));
      const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.deepEqual([
        wallet.availableBalance,
        wallet.reservedBalance,
        wallet.lockedBalance,
        wallet.currentBalance,
      ], [1_200, 0, 0, 1_200]);
      assert.equal(await InternalTopUpFunding.countDocuments({
        topUpRequestId: topUp.request._id,
      }), 1);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
      }), 2);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.INTERNAL_TOP_UP_FUNDING,
        userId: fixture.fixture.actors.creatorId,
      }), 1);
      assert.equal(await WalletProjectionOperation.countDocuments({
        walletId: fixture.creatorWallet._id,
      }), 2);
    } finally {
      await server.close();
    }
  });
};
