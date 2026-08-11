import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingCreatorSettlement } from "../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from "../../../models/bookingEscrowAllocation.model";
import { Dispute } from "../../../models/dispute.model";
import { UserProfile } from "../../../models/userProfile.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { bookingCreatorSettlementRepository } from "../../../repositories/bookingCreatorSettlement.repository";
import { bookingCreatorSettlementService } from "../../../services/financial/bookingCreatorSettlement.service";
import { bookingEscrowAllocationService } from "../../../services/financial/bookingEscrowAllocation.service";
import { walletProjectionService } from "../../../services/wallet/walletProjection.service";
import {
  createCapturedWalletBooking,
} from "../phase8d/fixtures/bookingEscrowAllocationFixtures";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "./fixtures/bookingCreatorSettlementFixtures";

const expectCode = async (operation: Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: any) => {
    assert.equal(error?.code, code, String(error));
    return true;
  });
};

const assertNoSettlementEffect = async (
  fixture: Awaited<ReturnType<typeof createAllocatedCreatorSettlementFixture>>,
  before: { balance: number; version: number },
) => {
  assert.equal(await BookingCreatorSettlement.countDocuments({
    bookingId: fixture.booking._id,
  }), 0);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId: fixture.booking._id,
    source: LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
  }), 0);
  assert.equal(await WalletProjectionOperation.countDocuments({
    walletId: fixture.creatorWallet._id,
  }), 0);
  assert.equal(await AuditLog.countDocuments({
    action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
  }), 0);
  const wallet = await Wallet.findById(fixture.creatorWallet._id).orFail();
  assert.equal(wallet.currentBalance, before.balance);
  assert.equal(wallet.projectionVersion, before.version);
  assert.equal((await Booking.findById(fixture.booking._id).orFail()).status, "COMPLETED");
  assert.equal((await BookingEscrowAllocation.findById(
    fixture.allocation._id,
  ).orFail()).status, "ALLOCATED");
};

export const registerBookingCreatorSettlementFailureTests = () => {
  test("phase8e missing Creator currency Wallet is created through the User-owned Wallet authority", async () => {
    const server = await startSettlementHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      await bookingEscrowAllocationService.allocate(captured.booking._id.toString());
      await UserProfile.create({
        userId: captured.fixture.actors.creatorId,
        username: `phase8e_creator_wallet_${captured.booking._id}`,
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        interests: ["finance"],
        bio: "Phase 8E Creator Wallet creation test",
        avatar: "https://test.local/avatar",
        cover: "https://test.local/cover",
        profilePhotos: ["https://test.local/1", "https://test.local/2"],
        profileStatus: "verified",
      });
      const result = await bookingCreatorSettlementService.settle(
        captured.booking._id.toString(),
      );
      assert.equal(result.replay, false);
      assert.equal(result.wallet.currency, "INR");
      assert.equal(await Wallet.countDocuments({
        userId: captured.fixture.actors.creatorId,
        currency: "INR",
      }), 1);
    } finally {
      await server.close();
    }
  });

  test("phase8e Creator Wallet currency buckets remain independent", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(
        server.baseUrl,
        { creatorWalletCurrency: "USD" },
      );
      await UserProfile.create({
        userId: fixture.fixture.actors.creatorId,
        username: `phase8e_creator_currency_${fixture.booking._id}`,
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        interests: ["finance"],
        bio: "Phase 8E multi-currency Creator Wallet test",
        avatar: "https://test.local/avatar",
        cover: "https://test.local/cover",
        profilePhotos: ["https://test.local/1", "https://test.local/2"],
        profileStatus: "verified",
      });
      const result = await bookingCreatorSettlementService.settle(
        fixture.booking._id.toString(),
      );
      assert.equal(result.wallet.currency, "INR");
      assert.equal(await Wallet.countDocuments({
        userId: fixture.fixture.actors.creatorId,
      }), 2);
    } finally {
      await server.close();
    }
  });

  test("phase8e OPEN dispute blocks settlement with zero Phase 8E effect", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const before = {
        balance: fixture.creatorWallet.currentBalance,
        version: fixture.creatorWallet.projectionVersion,
      };
      await Dispute.create({
        bookingId: fixture.booking._id,
        raisedBy: fixture.fixture.actors.userId,
        raisedByRole: "USER",
        reason: "Phase 8E settlement dispute guard",
        status: "OPEN",
        slaHours: 48,
        escalationLevel: "NONE",
        signals: [],
      });
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_DISPUTE_OPEN",
      );
      await assertNoSettlementEffect(fixture, before);
    } finally {
      await server.close();
    }
  });

  test("phase8e financial lock blocks settlement with zero Phase 8E effect", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const before = {
        balance: fixture.creatorWallet.currentBalance,
        version: fixture.creatorWallet.projectionVersion,
      };
      await Booking.updateOne(
        { _id: fixture.booking._id },
        { $set: { isFinancialLocked: true } },
      );
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_FINANCIAL_LOCKED",
      );
      await assertNoSettlementEffect(fixture, before);
    } finally {
      await server.close();
    }
  });

  test("phase8e projection failure rolls back PENDING record and both Ledger entries", async () => {
    const server = await startSettlementHttpServer();
    const original = walletProjectionService.applyProjectionMutation.bind(
      walletProjectionService,
    );
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const before = {
        balance: fixture.creatorWallet.currentBalance,
        version: fixture.creatorWallet.projectionVersion,
      };
      walletProjectionService.applyProjectionMutation = async () => {
        throw new Error("controlled Phase 8E projection failure");
      };
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT",
      );
      await assertNoSettlementEffect(fixture, before);
    } finally {
      walletProjectionService.applyProjectionMutation = original;
      await server.close();
    }
  });

  test("phase8e failure after projection rolls back Wallet, projection, Ledger, and authority", async () => {
    const server = await startSettlementHttpServer();
    const original =
      bookingCreatorSettlementRepository.guardPendingToSettled.bind(
        bookingCreatorSettlementRepository,
      );
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const before = {
        balance: fixture.creatorWallet.currentBalance,
        version: fixture.creatorWallet.projectionVersion,
      };
      bookingCreatorSettlementRepository.guardPendingToSettled =
        async () => null;
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
      );
      await assertNoSettlementEffect(fixture, before);
    } finally {
      bookingCreatorSettlementRepository.guardPendingToSettled = original;
      await server.close();
    }
  });

  test("phase8e audit failure before commit rolls back every Phase 8E effect", async () => {
    const server = await startSettlementHttpServer();
    const auditModel = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = auditModel.create;
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      const before = {
        balance: fixture.creatorWallet.currentBalance,
        version: fixture.creatorWallet.projectionVersion,
      };
      auditModel.create = (async () => {
        throw new Error("controlled Phase 8E audit failure");
      }) as typeof AuditLog.create;
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT",
      );
      await assertNoSettlementEffect(fixture, before);
    } finally {
      auditModel.create = original;
      await server.close();
    }
  });

  test("phase8e corrupted allocation amounts and Ledger graph fail closed", async () => {
    const server = await startSettlementHttpServer();
    try {
      const amountFixture =
        await createAllocatedCreatorSettlementFixture(server.baseUrl);
      await BookingEscrowAllocation.collection.updateOne(
        { _id: amountFixture.allocation._id },
        { $set: { commissionAmount: 201, creatorAmount: 799 } },
      );
      await expectCode(
        bookingCreatorSettlementService.settle(
          amountFixture.booking._id.toString(),
        ),
        "BOOKING_CREATOR_SETTLEMENT_COMMISSION_CONFLICT",
      );
      assert.equal(await BookingCreatorSettlement.countDocuments(), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8e corrupted allocation Ledger direction fails closed", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      await LedgerEntry.collection.updateOne({
        bookingId: fixture.booking._id,
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
        account: LedgerAccount.CREATOR_PAYABLE,
      }, {
        $set: { direction: "DEBIT" },
      });
      await expectCode(
        bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
        "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT",
      );
      assert.equal(await BookingCreatorSettlement.countDocuments(), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8e settled replay rejects corrupted projection deltas", async () => {
    const server = await startSettlementHttpServer();
    try {
      const fixture = await createAllocatedCreatorSettlementFixture(server.baseUrl);
      await bookingCreatorSettlementService.settle(fixture.booking._id.toString());
      await WalletProjectionOperation.collection.updateOne({
        walletId: fixture.creatorWallet._id,
      }, {
        $set: { "deltas.availableBalance": 799 },
      });
      await expectCode(
        bookingCreatorSettlementService.validateReplay(
          fixture.booking._id.toString(),
        ),
        "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT",
      );
    } finally {
      await server.close();
    }
  });
};
