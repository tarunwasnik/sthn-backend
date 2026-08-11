import { ClientSession, Types } from "mongoose";

import { WalletConversionOperationalClassification } from
  "../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalSeverity } from
  "../enums/financial/walletConversionOperationalSeverity.enum";
import { WalletConversionReconciliation } from
  "../models/walletConversionReconciliation.model";

const AUTHORITY = "+reconciliationKey +conversionRequestId +inspectedBy";

export class WalletConversionReconciliationRepository {
  findByConversionReference(reference: string, session?: ClientSession) {
    return WalletConversionReconciliation.findOne({
      conversionReference: reference,
    }).select(AUTHORITY).session(session ?? null).exec();
  }

  findByReference(reference: string, session?: ClientSession) {
    return WalletConversionReconciliation.findOne({
      reconciliationReference: reference,
    }).select(AUTHORITY).session(session ?? null).exec();
  }

  upsertInspection(input: {
    reconciliationReference: string;
    reconciliationKey: string;
    conversionRequestId: Types.ObjectId;
    conversionReference: string;
    classification: WalletConversionOperationalClassification;
    severity: WalletConversionOperationalSeverity;
    issues: string[];
    inspectedBy: Types.ObjectId;
    inspectedAt: Date;
  }, session: ClientSession) {
    return WalletConversionReconciliation.findOneAndUpdate({
      conversionRequestId: input.conversionRequestId,
    }, {
      $set: { classification: input.classification, severity: input.severity,
        issues: input.issues, inspectedAt: input.inspectedAt },
      $setOnInsert: { reconciliationReference: input.reconciliationReference,
        reconciliationKey: input.reconciliationKey,
        conversionRequestId: input.conversionRequestId,
        conversionReference: input.conversionReference,
        inspectedBy: input.inspectedBy, retryPerformed: false,
        repairPerformed: false },
      $inc: { version: 1 },
    }, { new: true, upsert: true, runValidators: true, session })
      .select(AUTHORITY).exec();
  }

  markRetry(input: { reference: string;
    expectedClassification: WalletConversionOperationalClassification;
    classification: WalletConversionOperationalClassification;
    severity: WalletConversionOperationalSeverity; issues: string[];
    inspectedAt: Date }, session: ClientSession) {
    return WalletConversionReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      classification: input.expectedClassification,
      retryPerformed: false,
    }, { $set: { retryPerformed: true,
      classification: input.classification, severity: input.severity,
      issues: input.issues, inspectedAt: input.inspectedAt },
      $inc: { version: 1 } },
    { new: true, runValidators: true, session }).select(AUTHORITY).exec();
  }

  markRepair(input: { reference: string;
    expectedClassification: WalletConversionOperationalClassification;
    classification: WalletConversionOperationalClassification;
    severity: WalletConversionOperationalSeverity; issues: string[];
    inspectedAt: Date }, session: ClientSession) {
    return WalletConversionReconciliation.findOneAndUpdate({
      reconciliationReference: input.reference,
      classification: input.expectedClassification,
      repairPerformed: false,
    }, { $set: { repairPerformed: true,
      classification: input.classification, severity: input.severity,
      issues: input.issues, inspectedAt: input.inspectedAt },
      $inc: { version: 1 } },
    { new: true, runValidators: true, session }).select(AUTHORITY).exec();
  }
}

export const walletConversionReconciliationRepository =
  new WalletConversionReconciliationRepository();
