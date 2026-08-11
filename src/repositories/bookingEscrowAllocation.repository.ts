import { ClientSession, Types } from "mongoose";

import { BookingEscrowAllocationStatus } from "../enums/financial/bookingEscrowAllocationStatus.enum";
import {
  BookingEscrowAllocation,
  BookingEscrowAllocationDocument,
} from "../models/bookingEscrowAllocation.model";

const AUTHORITY_FIELDS =
  "+allocationKey +escrowLedgerTransaction +allocationLedgerTransaction " +
  "+allocationLedgerEntryIds +allocationFingerprint";

export class BookingEscrowAllocationRepository {
  async createPending(
    data: Partial<BookingEscrowAllocationDocument>,
    session: ClientSession,
  ): Promise<BookingEscrowAllocationDocument> {
    const [allocation] = await BookingEscrowAllocation.create([{
      ...data,
      status: BookingEscrowAllocationStatus.PENDING,
      version: 0,
    }], { session });
    return allocation;
  }

  async findByBookingAuthoritative(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingEscrowAllocationDocument | null> {
    return BookingEscrowAllocation.findOne({ bookingId })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async findByAllocationKey(
    allocationKey: string,
    session?: ClientSession,
  ): Promise<BookingEscrowAllocationDocument | null> {
    return BookingEscrowAllocation.findOne({ allocationKey })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async guardPendingToAllocated(
    input: {
      allocationId: Types.ObjectId;
      allocationKey: string;
      bookingId: Types.ObjectId;
      paymentId: Types.ObjectId;
      reservationId: Types.ObjectId;
      customerId: Types.ObjectId;
      creatorId: Types.ObjectId;
      bookingAmount: number;
      serviceAmount: number;
      platformFeeAmount: number;
      totalAmount: number;
      currency: string;
      commissionRateBps: number;
      commissionAmount: number;
      creatorAmount: number;
      escrowLedgerTransaction: string;
      allocationLedgerTransaction: string;
      allocationLedgerEntryIds: Types.ObjectId[];
      allocationFingerprint: string;
      allocatedAt: Date;
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingEscrowAllocationDocument | null> {
    return BookingEscrowAllocation.findOneAndUpdate({
      _id: input.allocationId,
      allocationKey: input.allocationKey,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      reservationId: input.reservationId,
      customerId: input.customerId,
      creatorId: input.creatorId,
      bookingAmount: input.bookingAmount,
      serviceAmount: input.serviceAmount,
      platformFeeAmount: input.platformFeeAmount,
      totalAmount: input.totalAmount,
      currency: input.currency,
      commissionRateBps: input.commissionRateBps,
      commissionAmount: input.commissionAmount,
      creatorAmount: input.creatorAmount,
      escrowLedgerTransaction: input.escrowLedgerTransaction,
      allocationLedgerTransaction: input.allocationLedgerTransaction,
      allocationFingerprint: input.allocationFingerprint,
      status: BookingEscrowAllocationStatus.PENDING,
      allocatedAt: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        status: BookingEscrowAllocationStatus.ALLOCATED,
        allocationLedgerEntryIds: input.allocationLedgerEntryIds,
        allocatedAt: input.allocatedAt,
      },
      $inc: { version: 1 },
    }, {
      new: true,
      runValidators: true,
      session,
    }).select(AUTHORITY_FIELDS).exec();
  }
}

export const bookingEscrowAllocationRepository =
  new BookingEscrowAllocationRepository();
