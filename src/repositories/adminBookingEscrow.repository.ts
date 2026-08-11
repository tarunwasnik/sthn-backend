import { Booking } from "../models/booking.model";
import { BookingCreatorSettlement } from "../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from "../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from "../models/bookingFundReservation.model";
import { Dispute } from "../models/dispute.model";
import { Payment } from "../models/payment.model";

export interface AdminBookingEscrowRecord {
  bookingReference: string;
  paymentReference?: string;
  status: string;
  paymentMethod?: string;
  isFinancialLocked: boolean;
  currency: string;
  serviceAmount: number;
  platformFeeAmount: number;
  commissionAmount: number;
  creatorAmount: number;
  totalAmount: number;
  completedAt?: Date;
  settlementEligibleAt?: Date;
  payment?: { status?: string; capturedAt?: Date; paymentReference?: string };
  reservation?: { status?: string };
  allocation?: { status?: string; allocationReference?: string; allocatedAt?: Date };
  settlement?: { status?: string; settlementReference?: string; settledAt?: Date };
  hasOpenDispute: boolean;
}

export class AdminBookingEscrowRepository {
  private pipeline(match: Record<string, unknown>) {
    return [
      { $match: match },
      { $lookup: { from: Payment.collection.name, localField: "paymentId", foreignField: "_id", as: "payment" } },
      { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: BookingFundReservation.collection.name, localField: "_id", foreignField: "bookingId", as: "reservation" } },
      { $unwind: { path: "$reservation", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: BookingEscrowAllocation.collection.name, localField: "_id", foreignField: "bookingId", as: "allocation" } },
      { $unwind: { path: "$allocation", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: BookingCreatorSettlement.collection.name, localField: "_id", foreignField: "bookingId", as: "settlement" } },
      { $unwind: { path: "$settlement", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: Dispute.collection.name, let: { bookingId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$bookingId", "$$bookingId"] }, { $eq: ["$status", "OPEN"] }] } } }, { $limit: 1 }], as: "openDispute" } },
      { $project: { _id: 0, bookingReference: 1, paymentReference: 1, status: 1, paymentMethod: 1, isFinancialLocked: 1, currency: 1, serviceAmount: 1, platformFeeAmount: 1, commissionAmount: 1, creatorAmount: 1, totalAmount: 1, completedAt: 1, settlementEligibleAt: 1, payment: { status: "$payment.status", capturedAt: "$payment.capturedAt", paymentReference: "$payment.paymentReference" }, reservation: { status: "$reservation.status" }, allocation: { status: "$allocation.status", allocationReference: "$allocation.allocationReference", allocatedAt: "$allocation.allocatedAt" }, settlement: { status: "$settlement.status", settlementReference: "$settlement.settlementReference", settledAt: "$settlement.settledAt" }, hasOpenDispute: { $gt: [{ $size: "$openDispute" }, 0] } } },
    ];
  }

  async list(): Promise<AdminBookingEscrowRecord[]> {
    return Booking.aggregate<AdminBookingEscrowRecord>([
      ...this.pipeline({ status: "COMPLETED", paymentMethod: "WALLET" }),
      { $sort: { settlementEligibleAt: 1, bookingReference: 1 } },
      { $limit: 100 },
    ]).exec();
  }

  async findByBookingReference(reference: string): Promise<AdminBookingEscrowRecord | null> {
    const [record] = await Booking.aggregate<AdminBookingEscrowRecord>([
      ...this.pipeline({ bookingReference: reference }),
      { $limit: 1 },
    ]).exec();
    return record ?? null;
  }
}

export const adminBookingEscrowRepository = new AdminBookingEscrowRepository();
