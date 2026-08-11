"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingEscrowAllocationRepository = exports.BookingEscrowAllocationRepository = void 0;
const bookingEscrowAllocationStatus_enum_1 = require("../enums/financial/bookingEscrowAllocationStatus.enum");
const bookingEscrowAllocation_model_1 = require("../models/bookingEscrowAllocation.model");
const AUTHORITY_FIELDS = "+allocationKey +escrowLedgerTransaction +allocationLedgerTransaction " +
    "+allocationLedgerEntryIds +allocationFingerprint";
class BookingEscrowAllocationRepository {
    async createPending(data, session) {
        const [allocation] = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.create([{
                ...data,
                status: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.PENDING,
                version: 0,
            }], { session });
        return allocation;
    }
    async findByBookingAuthoritative(bookingId, session) {
        return bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ bookingId })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async findByAllocationKey(allocationKey, session) {
        return bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ allocationKey })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async guardPendingToAllocated(input, session) {
        return bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOneAndUpdate({
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
            status: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.PENDING,
            allocatedAt: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                status: bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED,
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
exports.BookingEscrowAllocationRepository = BookingEscrowAllocationRepository;
exports.bookingEscrowAllocationRepository = new BookingEscrowAllocationRepository();
