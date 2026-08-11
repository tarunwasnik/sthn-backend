import { ClientSession, Types } from "mongoose";

import {
  BookingCreatorSettlementReconciliation,
  BookingCreatorSettlementReconciliationDocument,
} from "../models/bookingCreatorSettlementReconciliation.model";

const AUTHORITY_FIELDS =
  "+reconciliationKey +settlementId +snapshot +snapshotFingerprint";

export class BookingCreatorSettlementReconciliationRepository {
  findByReference(reference: string, session?: ClientSession) {
    return BookingCreatorSettlementReconciliation.findOne({
      reconciliationReference: reference,
    }).select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  findBySettlementId(settlementId: Types.ObjectId, session?: ClientSession) {
    return BookingCreatorSettlementReconciliation.findOne({ settlementId })
      .select(AUTHORITY_FIELDS).session(session ?? null).exec();
  }

  upsertObservation(
    input: Partial<BookingCreatorSettlementReconciliationDocument> & {
      settlementId: Types.ObjectId;
    },
    session: ClientSession,
  ) {
    return BookingCreatorSettlementReconciliation.findOneAndUpdate({
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

export const bookingCreatorSettlementReconciliationRepository =
  new BookingCreatorSettlementReconciliationRepository();
