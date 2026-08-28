"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminBookingEscrowRepository = exports.AdminBookingEscrowRepository = void 0;
const booking_model_1 = require("../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../models/bookingFundReservation.model");
const dispute_model_1 = require("../models/dispute.model");
const payment_model_1 = require("../models/payment.model");
class AdminBookingEscrowRepository {
    pipeline(match) {
        return [
            { $match: match },
            { $lookup: { from: payment_model_1.Payment.collection.name, localField: "paymentId", foreignField: "_id", as: "payment" } },
            { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: bookingFundReservation_model_1.BookingFundReservation.collection.name, localField: "_id", foreignField: "bookingId", as: "reservation" } },
            { $unwind: { path: "$reservation", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: bookingEscrowAllocation_model_1.BookingEscrowAllocation.collection.name, localField: "_id", foreignField: "bookingId", as: "allocation" } },
            { $unwind: { path: "$allocation", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.name, localField: "_id", foreignField: "bookingId", as: "settlement" } },
            { $unwind: { path: "$settlement", preserveNullAndEmptyArrays: true } },
            { $lookup: { from: dispute_model_1.Dispute.collection.name, let: { bookingId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$bookingId", "$$bookingId"] }, { $eq: ["$status", "OPEN"] }] } } }, { $limit: 1 }], as: "openDispute" } },
            { $project: { _id: 0, bookingReference: 1, paymentReference: 1, status: 1, paymentMethod: 1, isFinancialLocked: 1, currency: 1, serviceAmount: 1, platformFeeAmount: 1, commissionAmount: 1, creatorAmount: 1, totalAmount: 1, completedAt: 1, settlementEligibleAt: 1, payment: { status: "$payment.status", capturedAt: "$payment.capturedAt", paymentReference: "$payment.paymentReference" }, reservation: { status: "$reservation.status" }, allocation: { status: "$allocation.status", allocationReference: "$allocation.allocationReference", allocatedAt: "$allocation.allocatedAt" }, settlement: { status: "$settlement.status", settlementReference: "$settlement.settlementReference", settledAt: "$settlement.settledAt" }, hasOpenDispute: { $gt: [{ $size: "$openDispute" }, 0] } } },
        ];
    }
    async list() {
        return booking_model_1.Booking.aggregate([
            ...this.pipeline({ status: "COMPLETED", paymentMethod: "WALLET" }),
            { $sort: { settlementEligibleAt: 1, bookingReference: 1 } },
            { $limit: 100 },
        ]).exec();
    }
    async findByBookingReference(reference) {
        const [record] = await booking_model_1.Booking.aggregate([
            ...this.pipeline({ bookingReference: reference }),
            { $limit: 1 },
        ]).exec();
        return record ?? null;
    }
}
exports.AdminBookingEscrowRepository = AdminBookingEscrowRepository;
exports.adminBookingEscrowRepository = new AdminBookingEscrowRepository();
