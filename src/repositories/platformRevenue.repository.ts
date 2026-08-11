import { LedgerAccount } from "../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../enums/financial/moneyDirection.enum";
import { Booking } from "../models/booking.model";
import { LedgerEntry } from "../models/ledgerEntry.model";
import { Payment } from "../models/payment.model";

const revenueMatch = { direction: MoneyDirection.CREDIT, account: { $in: [LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE, LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE] } };

export class PlatformRevenueRepository {
  async summary() {
    return LedgerEntry.aggregate([
      { $match: revenueMatch },
      { $group: { _id: "$currency", customerPlatformFeeRevenue: { $sum: { $cond: [{ $eq: ["$account", LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE] }, "$amount", 0] } }, creatorCommissionRevenue: { $sum: { $cond: [{ $eq: ["$account", LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE] }, "$amount", 0] } } } },
      { $project: { _id: 0, currency: "$_id", customerPlatformFeeRevenue: 1, creatorCommissionRevenue: 1, totalPlatformRevenue: { $add: ["$customerPlatformFeeRevenue", "$creatorCommissionRevenue"] } } },
      { $sort: { currency: 1 } },
    ]).exec();
  }
  async entries(page: number, limit: number) {
    const [items, total] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: revenueMatch },
        { $lookup: { from: Booking.collection.name, localField: "bookingId", foreignField: "_id", as: "booking" } }, { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },
        { $lookup: { from: Payment.collection.name, localField: "paymentId", foreignField: "_id", as: "payment" } }, { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
        { $sort: { createdAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
        { $project: { _id: 0, bookingReference: "$booking.bookingReference", paymentReference: "$payment.paymentReference", category: { $cond: [{ $eq: ["$account", LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE] }, "CUSTOMER_PLATFORM_FEE", "CREATOR_COMMISSION"] }, currency: 1, amount: 1, recognizedAt: "$createdAt" } },
      ]).exec(), LedgerEntry.countDocuments(revenueMatch),
    ]);
    return { items, pagination: { page, limit, total } };
  }
}
export const platformRevenueRepository = new PlatformRevenueRepository();
