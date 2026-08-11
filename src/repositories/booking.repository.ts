import { ClientSession, Types } from "mongoose";

import { Booking, IBooking } from "../models/booking.model";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

export interface BookingTerminationTransition {
  bookingId: Types.ObjectId;
  expectedStatuses: IBooking["status"][];
  targetStatus: Extract<IBooking["status"], "REJECTED" | "CANCELLED" | "EXPIRED">;
  terminationType: BookingTerminationType;
  terminationActorType: BookingTerminationActorType;
  terminationActorId?: Types.ObjectId;
  terminationReason?: string;
  terminationOperationKey: string;
}

export class BookingRepository {
  async findById(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).session(session ?? null).exec();
  }

  async findByBookingReference(
    bookingReference: string,
    session?: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOne({ bookingReference }).session(session ?? null).exec();
  }

  async transitionToTerminated(
    input: BookingTerminationTransition,
    session: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOneAndUpdate(
      {
        _id: input.bookingId,
        status: { $in: input.expectedStatuses },
        $or: [
          { terminationOperationKey: { $exists: false } },
          { terminationOperationKey: input.terminationOperationKey },
        ],
      },
      {
        $set: {
          status: input.targetStatus,
          terminationType: input.terminationType,
          terminatedByType: input.terminationActorType,
          ...(input.terminationActorId ? { terminatedById: input.terminationActorId } : {}),
          ...(input.terminationReason ? { terminationReason: input.terminationReason } : {}),
          terminationOperationKey: input.terminationOperationKey,
          terminatedAt: new Date(),
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async guardConfirmedToCompleted(
    input: {
      bookingId: Types.ObjectId;
      cause: BookingWalletCaptureCause;
      actorType: BookingCompletionActorType;
      actorId?: Types.ObjectId;
      operationKey: string;
      completedAt: Date;
      settlementEligibleAt: Date;
    },
    session: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOneAndUpdate(
      {
        _id: input.bookingId,
        status: "CONFIRMED",
        isFinancialLocked: { $ne: true },
        completionOperationKey: { $exists: false },
      },
      {
        $set: {
          status: "COMPLETED",
          paymentStatus: "PAID",
          isPayable: false,
          isPayoutEligible: false,
          isFinancialLocked: false,
          completedAt: input.completedAt,
          settlementEligibleAt: input.settlementEligibleAt,
          completionCause: input.cause,
          completedByType: input.actorType,
          ...(input.actorId ? { completedById: input.actorId } : {}),
          completionOperationKey: input.operationKey,
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async findCompletedReplay(
    bookingId: Types.ObjectId,
    operationKey: string,
    session?: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOne({
      _id: bookingId,
      status: "COMPLETED",
      completionOperationKey: operationKey,
    }).session(session ?? null).exec();
  }
}

export const bookingRepository = new BookingRepository();
