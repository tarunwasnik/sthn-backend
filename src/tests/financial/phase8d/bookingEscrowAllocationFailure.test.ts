import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingEscrowAllocation } from "../../../models/bookingEscrowAllocation.model";
import { Dispute } from "../../../models/dispute.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { LedgerAccount } from "../../../enums/financial/ledgerAccount.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { bookingEscrowAllocationRepository } from "../../../repositories/bookingEscrowAllocation.repository";
import { bookingEscrowAllocationService } from "../../../services/financial/bookingEscrowAllocation.service";
import { ledgerService } from "../../../services/financial/ledger.service";
import {
  createCapturedWalletBooking,
  startAllocationHttpServer,
} from "./fixtures/bookingEscrowAllocationFixtures";

const expectCode = async (operation: Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: any) => {
    assert.equal(error?.code, code, String(error));
    return true;
  });
};

const assertNoAllocation = async (
  bookingId: string,
  walletId: string,
  walletVersion: number,
  currentBalance: number,
  projectionCount: number,
) => {
  assert.equal(await BookingEscrowAllocation.countDocuments({ bookingId }), 0);
  assert.equal(await LedgerEntry.countDocuments({
    bookingId,
    source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
  }), 0);
  assert.equal(await WalletProjectionOperation.countDocuments(), projectionCount);
  const wallet = await Wallet.findById(walletId).orFail();
  assert.equal(wallet.currentBalance, currentBalance);
  assert.equal(wallet.projectionVersion, walletVersion);
  assert.equal((await Booking.findById(bookingId).orFail()).status, "COMPLETED");
};

export const registerBookingEscrowAllocationFailureTests = () => {
  test("phase8d OPEN dispute blocks allocation with zero accounting effects", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      const wallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projections = await WalletProjectionOperation.countDocuments();
      await Dispute.create({
        bookingId: captured.booking._id,
        raisedBy: captured.fixture.actors.userId,
        raisedByRole: "USER",
        reason: "Phase 8D allocation dispute guard",
        status: "OPEN",
        slaHours: 48,
        escalationLevel: "NONE",
        signals: [],
      });
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN",
      );
      await assertNoAllocation(
        captured.booking._id.toString(),
        wallet._id.toString(),
        wallet.projectionVersion,
        wallet.currentBalance,
        projections,
      );
    } finally {
      await server.close();
    }
  });

  test("phase8d financial lock blocks allocation with zero accounting effects", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      const wallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projections = await WalletProjectionOperation.countDocuments();
      await Booking.updateOne(
        { _id: captured.booking._id },
        { $set: { isFinancialLocked: true } },
      );
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_FINANCIAL_LOCKED",
      );
      await assertNoAllocation(
        captured.booking._id.toString(),
        wallet._id.toString(),
        wallet.projectionVersion,
        wallet.currentBalance,
        projections,
      );
    } finally {
      await server.close();
    }
  });

  test("phase8d existing settlement link blocks allocation", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      await Booking.collection.updateOne(
        { _id: captured.booking._id },
        { $set: { settlementId: captured.fixture.actors.adminId } },
      );
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT",
      );
      assert.equal(await BookingEscrowAllocation.countDocuments(), 0);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8d Ledger failure after escrow debit attempt rolls back record and all postings", async () => {
    const server = await startAllocationHttpServer();
    const original = ledgerService.createCredit.bind(ledgerService);
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      const wallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projections = await WalletProjectionOperation.countDocuments();
      ledgerService.createCredit = async () => {
        throw new Error("controlled Phase 8D Ledger failure");
      };
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT",
      );
      await assertNoAllocation(
        captured.booking._id.toString(),
        wallet._id.toString(),
        wallet.projectionVersion,
        wallet.currentBalance,
        projections,
      );
    } finally {
      ledgerService.createCredit = original;
      await server.close();
    }
  });

  test("phase8d failure after all Ledger postings rolls back PENDING record and transaction", async () => {
    const server = await startAllocationHttpServer();
    const original =
      bookingEscrowAllocationRepository.guardPendingToAllocated.bind(
        bookingEscrowAllocationRepository,
      );
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      const wallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projections = await WalletProjectionOperation.countDocuments();
      bookingEscrowAllocationRepository.guardPendingToAllocated =
        async () => null;
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
      );
      await assertNoAllocation(
        captured.booking._id.toString(),
        wallet._id.toString(),
        wallet.projectionVersion,
        wallet.currentBalance,
        projections,
      );
    } finally {
      bookingEscrowAllocationRepository.guardPendingToAllocated = original;
      await server.close();
    }
  });

  test("phase8d audit failure before commit rolls back allocation and Ledger", async () => {
    const server = await startAllocationHttpServer();
    const auditModel = AuditLog as unknown as { create: typeof AuditLog.create };
    const original = auditModel.create;
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      const wallet = await Wallet.findById(captured.fixture.actors.wallet._id).orFail();
      const projections = await WalletProjectionOperation.countDocuments();
      auditModel.create = (async () => {
        throw new Error("controlled Phase 8D audit failure");
      }) as typeof AuditLog.create;
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT",
      );
      await assertNoAllocation(
        captured.booking._id.toString(),
        wallet._id.toString(),
        wallet.projectionVersion,
        wallet.currentBalance,
        projections,
      );
    } finally {
      auditModel.create = original;
      await server.close();
    }
  });

  test("phase8d corrupted capture Ledger blocks allocation", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      await LedgerEntry.collection.updateOne({
        bookingId: captured.booking._id,
        source: LedgerSource.BOOKING_WALLET_CAPTURE,
        account: LedgerAccount.PLATFORM_ESCROW,
      }, {
        $set: { account: LedgerAccount.CREATOR_PAYABLE },
      });
      await expectCode(
        bookingEscrowAllocationService.allocate(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR",
      );
      assert.equal(await BookingEscrowAllocation.countDocuments(), 0);
      assert.equal(await LedgerEntry.countDocuments({
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
      }), 0);
    } finally {
      await server.close();
    }
  });

  test("phase8d corrupted allocation amounts fail authoritative replay", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl, {
        walletAmount: 1_050,
        slotAmounts: [1_000],
      });
      await bookingEscrowAllocationService.allocate(captured.booking._id.toString());
      await BookingEscrowAllocation.collection.updateOne(
        { bookingId: captured.booking._id },
        { $set: { commissionAmount: 201, creatorAmount: 799 } },
      );
      await expectCode(
        bookingEscrowAllocationService.validateReplay(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT",
      );
    } finally {
      await server.close();
    }
  });

  test("phase8d corrupted allocation Ledger direction fails authoritative replay", async () => {
    const server = await startAllocationHttpServer();
    try {
      const captured = await createCapturedWalletBooking(server.baseUrl);
      await bookingEscrowAllocationService.allocate(captured.booking._id.toString());
      await LedgerEntry.collection.updateOne({
        bookingId: captured.booking._id,
        source: LedgerSource.BOOKING_ESCROW_ALLOCATION,
        account: LedgerAccount.PLATFORM_ESCROW,
      }, {
        $set: { direction: "CREDIT" },
      });
      await expectCode(
        bookingEscrowAllocationService.validateReplay(captured.booking._id.toString()),
        "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT",
      );
    } finally {
      await server.close();
    }
  });
};
