"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionReconciliationRepository = exports.WalletConversionReconciliationRepository = void 0;
const walletConversionReconciliation_model_1 = require("../models/walletConversionReconciliation.model");
const AUTHORITY = "+reconciliationKey +conversionRequestId +inspectedBy";
class WalletConversionReconciliationRepository {
    findByConversionReference(reference, session) {
        return walletConversionReconciliation_model_1.WalletConversionReconciliation.findOne({
            conversionReference: reference,
        }).select(AUTHORITY).session(session ?? null).exec();
    }
    findByReference(reference, session) {
        return walletConversionReconciliation_model_1.WalletConversionReconciliation.findOne({
            reconciliationReference: reference,
        }).select(AUTHORITY).session(session ?? null).exec();
    }
    upsertInspection(input, session) {
        return walletConversionReconciliation_model_1.WalletConversionReconciliation.findOneAndUpdate({
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
    markRetry(input, session) {
        return walletConversionReconciliation_model_1.WalletConversionReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            classification: input.expectedClassification,
            retryPerformed: false,
        }, { $set: { retryPerformed: true,
                classification: input.classification, severity: input.severity,
                issues: input.issues, inspectedAt: input.inspectedAt },
            $inc: { version: 1 } }, { new: true, runValidators: true, session }).select(AUTHORITY).exec();
    }
    markRepair(input, session) {
        return walletConversionReconciliation_model_1.WalletConversionReconciliation.findOneAndUpdate({
            reconciliationReference: input.reference,
            classification: input.expectedClassification,
            repairPerformed: false,
        }, { $set: { repairPerformed: true,
                classification: input.classification, severity: input.severity,
                issues: input.issues, inspectedAt: input.inspectedAt },
            $inc: { version: 1 } }, { new: true, runValidators: true, session }).select(AUTHORITY).exec();
    }
}
exports.WalletConversionReconciliationRepository = WalletConversionReconciliationRepository;
exports.walletConversionReconciliationRepository = new WalletConversionReconciliationRepository();
