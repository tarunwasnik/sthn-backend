"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingCreatorSettlementRetryAttemptRepository = exports.BookingCreatorSettlementRetryAttemptRepository = void 0;
const bookingCreatorSettlementRetryAttempt_model_1 = require("../models/bookingCreatorSettlementRetryAttempt.model");
class BookingCreatorSettlementRetryAttemptRepository {
    findByOperationKey(operationKey, session) {
        return bookingCreatorSettlementRetryAttempt_model_1.BookingCreatorSettlementRetryAttempt.findOne({ operationKey })
            .select("+operationKey +actorId").session(session ?? null).exec();
    }
    async create(input, session) {
        const [attempt] = await bookingCreatorSettlementRetryAttempt_model_1.BookingCreatorSettlementRetryAttempt.create([{ ...input, status: "STARTED" }], { session });
        return attempt;
    }
    complete(operationKey, resultCode, completedAt, session) {
        return bookingCreatorSettlementRetryAttempt_model_1.BookingCreatorSettlementRetryAttempt.findOneAndUpdate({
            operationKey,
            status: "STARTED",
            completedAt: { $exists: false },
        }, {
            $set: { status: "APPLIED", resultCode, completedAt },
        }, { new: true, runValidators: true, session }).exec();
    }
}
exports.BookingCreatorSettlementRetryAttemptRepository = BookingCreatorSettlementRetryAttemptRepository;
exports.bookingCreatorSettlementRetryAttemptRepository = new BookingCreatorSettlementRetryAttemptRepository();
