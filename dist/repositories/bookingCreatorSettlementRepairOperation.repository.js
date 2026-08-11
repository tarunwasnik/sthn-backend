"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingCreatorSettlementRepairOperationRepository = exports.BookingCreatorSettlementRepairOperationRepository = void 0;
const bookingCreatorSettlementRepairOperation_model_1 = require("../models/bookingCreatorSettlementRepairOperation.model");
class BookingCreatorSettlementRepairOperationRepository {
    findByOperationKey(operationKey, session) {
        return bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.findOne({ operationKey })
            .select("+operationKey +snapshotFingerprint +actorId")
            .session(session ?? null).exec();
    }
    async create(input, session) {
        const [operation] = await bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.create([{ ...input, status: "STARTED", repairedFields: [] }], { session });
        return operation;
    }
    complete(operationKey, repairedFields, appliedAt, session) {
        return bookingCreatorSettlementRepairOperation_model_1.BookingCreatorSettlementRepairOperation.findOneAndUpdate({
            operationKey,
            status: "STARTED",
        }, {
            $set: {
                status: "APPLIED",
                repairedFields,
                appliedAt,
                resultCode: "REPAIR_APPLIED",
            },
        }, { new: true, runValidators: true, session }).exec();
    }
}
exports.BookingCreatorSettlementRepairOperationRepository = BookingCreatorSettlementRepairOperationRepository;
exports.bookingCreatorSettlementRepairOperationRepository = new BookingCreatorSettlementRepairOperationRepository();
