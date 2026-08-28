"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRevenueRepository = exports.PlatformRevenueRepository = void 0;
const ledgerAccount_enum_1 = require("../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../enums/financial/moneyDirection.enum");
const booking_model_1 = require("../models/booking.model");
const ledgerEntry_model_1 = require("../models/ledgerEntry.model");
const payment_model_1 = require("../models/payment.model");
const revenueMatch = { direction: moneyDirection_enum_1.MoneyDirection.CREDIT, account: { $in: [ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE, ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE] } };
class PlatformRevenueRepository {
    async summary() {
        return ledgerEntry_model_1.LedgerEntry.aggregate([
            { $match: revenueMatch },
            { $group: { _id: "$currency", customerPlatformFeeRevenue: { $sum: { $cond: [{ $eq: ["$account", ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE] }, "$amount", 0] } }, creatorCommissionRevenue: { $sum: { $cond: [{ $eq: ["$account", ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE] }, "$amount", 0] } } } },
            { $project: { _id: 0, currency: "$_id", customerPlatformFeeRevenue: 1, creatorCommissionRevenue: 1, totalPlatformRevenue: { $add: ["$customerPlatformFeeRevenue", "$creatorCommissionRevenue"] } } },
            { $sort: { currency: 1 } },
        ]).exec();
    }
    async entries(page, limit) {
        const [items, total] = await Promise.all([
            ledgerEntry_model_1.LedgerEntry.aggregate([
                { $match: revenueMatch },
                { $lookup: { from: booking_model_1.Booking.collection.name, localField: "bookingId", foreignField: "_id", as: "booking" } }, { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },
                { $lookup: { from: payment_model_1.Payment.collection.name, localField: "paymentId", foreignField: "_id", as: "payment" } }, { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
                { $sort: { createdAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
                { $project: { _id: 0, bookingReference: "$booking.bookingReference", paymentReference: "$payment.paymentReference", category: { $cond: [{ $eq: ["$account", ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE] }, "CUSTOMER_PLATFORM_FEE", "CREATOR_COMMISSION"] }, currency: 1, amount: 1, recognizedAt: "$createdAt" } },
            ]).exec(), ledgerEntry_model_1.LedgerEntry.countDocuments(revenueMatch),
        ]);
        return { items, pagination: { page, limit, total } };
    }
}
exports.PlatformRevenueRepository = PlatformRevenueRepository;
exports.platformRevenueRepository = new PlatformRevenueRepository();
