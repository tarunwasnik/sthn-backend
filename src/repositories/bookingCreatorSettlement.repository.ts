import { ClientSession, Types } from "mongoose";

import { BookingCreatorSettlementStatus } from "../enums/financial/bookingCreatorSettlementStatus.enum";
import {
  BookingCreatorSettlement,
  BookingCreatorSettlementDocument,
} from "../models/bookingCreatorSettlement.model";

const AUTHORITY_FIELDS =
  "+settlementKey +captureTransactionId +allocationTransactionId " +
  "+settlementTransactionId +settlementFingerprint " +
  "+settlementProjectionOperationReference +settlementLedgerEntryIds";

export class BookingCreatorSettlementRepository {
  async createPending(
    data: Partial<BookingCreatorSettlementDocument>,
    session: ClientSession,
  ): Promise<BookingCreatorSettlementDocument> {
    const [settlement] = await BookingCreatorSettlement.create([{
      ...data,
      status: BookingCreatorSettlementStatus.PENDING,
      version: 0,
    }], { session });
    return settlement;
  }

  async findBySettlementKey(
    settlementKey: string,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOne({ settlementKey })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async findBySettlementReference(
    settlementReference: string,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOne({ settlementReference })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async findByAllocation(
    allocationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOne({ allocationId })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async findByBooking(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOne({ bookingId })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async findManyByCreatorUser(
    creatorUserId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument[]> {
    return BookingCreatorSettlement.find({ creatorUserId })
      .select(AUTHORITY_FIELDS)
      .sort({ settledAt: 1, _id: 1 })
      .session(session ?? null)
      .exec();
  }

  async findSettledAuthoritative(
    bookingId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOne({
      bookingId,
      status: BookingCreatorSettlementStatus.SETTLED,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  async guardPendingToSettled(
    input: {
      settlementId: Types.ObjectId;
      settlementKey: string;
      allocationId: Types.ObjectId;
      creatorUserId: Types.ObjectId;
      creatorWalletId: Types.ObjectId;
      creatorAmount: number;
      currency: string;
      settlementTransactionId: string;
      settlementProjectionOperationReference: string;
      settlementFingerprint: string;
      settlementLedgerEntryIds: Types.ObjectId[];
      settledAt: Date;
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOneAndUpdate({
      _id: input.settlementId,
      settlementKey: input.settlementKey,
      allocationId: input.allocationId,
      creatorUserId: input.creatorUserId,
      creatorWalletId: input.creatorWalletId,
      creatorAmount: input.creatorAmount,
      currency: input.currency,
      settlementTransactionId: input.settlementTransactionId,
      settlementProjectionOperationReference:
        input.settlementProjectionOperationReference,
      settlementFingerprint: input.settlementFingerprint,
      status: BookingCreatorSettlementStatus.PENDING,
      settledAt: { $exists: false },
      settlementLedgerEntryIds: { $size: 0 },
      version: input.expectedVersion,
    }, {
      $set: {
        status: BookingCreatorSettlementStatus.SETTLED,
        settlementLedgerEntryIds: input.settlementLedgerEntryIds,
        settledAt: input.settledAt,
      },
      $inc: { version: 1 },
    }, {
      new: true,
      runValidators: true,
      session,
    }).select(AUTHORITY_FIELDS).exec();
  }

  async guardRestoreLedgerEntryIds(
    input: {
      settlementId: Types.ObjectId;
      settlementKey: string;
      settlementFingerprint: string;
      settlementTransactionId: string;
      ledgerEntryIds: Types.ObjectId[];
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOneAndUpdate({
      _id: input.settlementId,
      settlementKey: input.settlementKey,
      settlementFingerprint: input.settlementFingerprint,
      settlementTransactionId: input.settlementTransactionId,
      status: BookingCreatorSettlementStatus.SETTLED,
      settlementLedgerEntryIds: { $size: 0 },
      version: input.expectedVersion,
    }, {
      $set: { settlementLedgerEntryIds: input.ledgerEntryIds },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }

  async guardOperationalPendingToSettled(
    input: {
      settlementId: Types.ObjectId;
      settlementKey: string;
      settlementFingerprint: string;
      settlementTransactionId: string;
      settlementProjectionOperationReference: string;
      ledgerEntryIds: Types.ObjectId[];
      settledAt: Date;
      expectedVersion: number;
    },
    session: ClientSession,
  ): Promise<BookingCreatorSettlementDocument | null> {
    return BookingCreatorSettlement.findOneAndUpdate({
      _id: input.settlementId,
      settlementKey: input.settlementKey,
      settlementFingerprint: input.settlementFingerprint,
      settlementTransactionId: input.settlementTransactionId,
      settlementProjectionOperationReference:
        input.settlementProjectionOperationReference,
      settlementLedgerEntryIds: input.ledgerEntryIds,
      status: BookingCreatorSettlementStatus.PENDING,
      settledAt: { $exists: false },
      version: input.expectedVersion,
    }, {
      $set: {
        status: BookingCreatorSettlementStatus.SETTLED,
        settledAt: input.settledAt,
      },
      $inc: { version: 1 },
    }, { new: true, runValidators: true, session })
      .select(AUTHORITY_FIELDS).exec();
  }
}

export const bookingCreatorSettlementRepository =
  new BookingCreatorSettlementRepository();
