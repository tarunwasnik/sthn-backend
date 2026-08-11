"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingCreatorSettlementReconciliationRepository = exports.BookingCreatorSettlementReconciliationRepository = void 0;
const bookingCreatorSettlementReconciliation_model_1 = require("../models/bookingCreatorSettlementReconciliation.model");
const AUTHORITY_FIELDS = "+reconciliationKey +settlementId +snapshot +snapshotFingerprint";
class BookingCreatorSettlementReconciliationRepository {
    findByReference(reference, session) {
        return bookingCreatorSettlementReconciliation_model_1.BookingCreatorSettlementReconciliation.findOne({
            reconciliationReference: reference,
        }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    findBySettlementId(settlementId, session) {
        return bookingCreatorSettlementReconciliation_model_1.BookingCreatorSettlementReconciliation.findOne({ settlementId })
            .select(AUTHORITY_FIELDS).session(session ?? null).exec();
    }
    upsertObservation(input, session) {
        return bookingCreatorSettlementReconciliation_model_1.BookingCreatorSettlementReconciliation.findOneAndUpdate({
            settlementId: input.settlementId,
        }, {
            $set: {
                status: input.status,
                result: input.result,
                classification: input.classification,
                issuesFound: input.issuesFound,
                checkedAt: input.checkedAt,
                snapshot: input.snapshot,
                snapshotFingerprint: input.snapshotFingerprint,
            },
            $setOnInsert: {
                reconciliationReference: input.reconciliationReference,
                reconciliationKey: input.reconciliationKey,
                settlementId: input.settlementId,
                settlementReference: input.settlementReference,
                bookingReference: input.bookingReference,
                allocationReference: input.allocationReference,
                walletReference: input.walletReference,
                creatorReference: input.creatorReference,
            },
            $inc: { version: 1 },
        }, {
            new: true,
            upsert: true,
            runValidators: true,
            session,
        }).select(AUTHORITY_FIELDS).exec();
    }
}
exports.BookingCreatorSettlementReconciliationRepository = BookingCreatorSettlementReconciliationRepository;
exports.bookingCreatorSettlementReconciliationRepository = new BookingCreatorSettlementReconciliationRepository();
