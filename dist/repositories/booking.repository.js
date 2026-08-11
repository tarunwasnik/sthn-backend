"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingRepository = exports.BookingRepository = void 0;
const booking_model_1 = require("../models/booking.model");
class BookingRepository {
    async findById(id, session) {
        return booking_model_1.Booking.findById(id).session(session ?? null).exec();
    }
    async transitionToTerminated(input, session) {
        return booking_model_1.Booking.findOneAndUpdate({
            _id: input.bookingId,
            status: { $in: input.expectedStatuses },
            $or: [
                { terminationOperationKey: { $exists: false } },
                { terminationOperationKey: input.terminationOperationKey },
            ],
        }, {
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
        }, { new: true, runValidators: true, session }).exec();
    }
    async guardConfirmedToCompleted(input, session) {
        return booking_model_1.Booking.findOneAndUpdate({
            _id: input.bookingId,
            status: "CONFIRMED",
            isFinancialLocked: { $ne: true },
            completionOperationKey: { $exists: false },
        }, {
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
        }, { new: true, runValidators: true, session }).exec();
    }
    async findCompletedReplay(bookingId, operationKey, session) {
        return booking_model_1.Booking.findOne({
            _id: bookingId,
            status: "COMPLETED",
            completionOperationKey: operationKey,
        }).session(session ?? null).exec();
    }
}
exports.BookingRepository = BookingRepository;
exports.bookingRepository = new BookingRepository();
