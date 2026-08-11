"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingCreatorSettlementRepository = exports.BookingCreatorSettlementRepository = void 0;
const bookingCreatorSettlementStatus_enum_1 = require("../enums/financial/bookingCreatorSettlementStatus.enum");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
const AUTHORITY_FIELDS = "+settlementKey +captureTransactionId +allocationTransactionId " +
    "+settlementTransactionId +settlementFingerprint " +
    "+settlementProjectionOperationReference +settlementLedgerEntryIds";
class BookingCreatorSettlementRepository {
    async createPending(data, session) {
        const [settlement] = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.create([{
                ...data,
                status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
                version: 0,
            }], { session });
        return settlement;
    }
    async findBySettlementKey(settlementKey, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ settlementKey })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async findBySettlementReference(settlementReference, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ settlementReference })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async findByAllocation(allocationId, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ allocationId })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async findByBooking(bookingId, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ bookingId })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async findManyByCreatorUser(creatorUserId, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.find({ creatorUserId })
            .select(AUTHORITY_FIELDS)
            .sort({ settledAt: 1, _id: 1 })
            .session(session ?? null)
            .exec();
    }
    async findSettledAuthoritative(bookingId, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({
            bookingId,
            status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    async guardPendingToSettled(input, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOneAndUpdate({
            _id: input.settlementId,
            settlementKey: input.settlementKey,
            allocationId: input.allocationId,
            creatorUserId: input.creatorUserId,
            creatorWalletId: input.creatorWalletId,
            creatorAmount: input.creatorAmount,
            currency: input.currency,
            settlementTransactionId: input.settlementTransactionId,
            settlementProjectionOperationReference: input.settlementProjectionOperationReference,
            settlementFingerprint: input.settlementFingerprint,
            status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
            settledAt: { $exists: false },
            settlementLedgerEntryIds: { $size: 0 },
            version: input.expectedVersion,
        }, {
            $set: {
                status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
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
    async guardRestoreLedgerEntryIds(input, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOneAndUpdate({
            _id: input.settlementId,
            settlementKey: input.settlementKey,
            settlementFingerprint: input.settlementFingerprint,
            settlementTransactionId: input.settlementTransactionId,
            status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
            settlementLedgerEntryIds: { $size: 0 },
            version: input.expectedVersion,
        }, {
            $set: { settlementLedgerEntryIds: input.ledgerEntryIds },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
    async guardOperationalPendingToSettled(input, session) {
        return bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOneAndUpdate({
            _id: input.settlementId,
            settlementKey: input.settlementKey,
            settlementFingerprint: input.settlementFingerprint,
            settlementTransactionId: input.settlementTransactionId,
            settlementProjectionOperationReference: input.settlementProjectionOperationReference,
            settlementLedgerEntryIds: input.ledgerEntryIds,
            status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.PENDING,
            settledAt: { $exists: false },
            version: input.expectedVersion,
        }, {
            $set: {
                status: bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED,
                settledAt: input.settledAt,
            },
            $inc: { version: 1 },
        }, { new: true, runValidators: true, session })
            .select(AUTHORITY_FIELDS).exec();
    }
}
exports.BookingCreatorSettlementRepository = BookingCreatorSettlementRepository;
exports.bookingCreatorSettlementRepository = new BookingCreatorSettlementRepository();
