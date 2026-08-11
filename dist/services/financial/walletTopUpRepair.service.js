"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRepairService = exports.WalletTopUpRepairService = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpOperationalAction_enum_1 = require("../../enums/financial/walletTopUpOperationalAction.enum");
const WalletTopUpReconciliationError_1 = require("../../errors/financial/WalletTopUpReconciliationError");
const topUpOperationalIdentity_util_1 = require("../../utils/financial/topUpOperationalIdentity.util");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const walletTopUpRepairOperation_repository_1 = require("../../repositories/walletTopUpRepairOperation.repository");
const walletTopUpReconciliation_service_1 = require("./walletTopUpReconciliation.service");
const walletTopUpOperationalAudit_service_1 = require("./walletTopUpOperationalAudit.service");
const REPAIR_ACTIONS = new Set([
    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS,
    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK,
    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK,
]);
class WalletTopUpRepairService {
    error(message, code) {
        return new WalletTopUpReconciliationError_1.WalletTopUpReconciliationError(message, WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode[code]);
    }
    duplicateKey(error) {
        return typeof error === "object" && error !== null &&
            "code" in error && error.code === 11000;
    }
    async repair(reconciliationReference, action, adminUserId) {
        if (!REPAIR_ACTIONS.has(action)) {
            throw this.error("Invalid top-up repair action.", "INVALID_ACTION");
        }
        const actorId = new mongoose_1.Types.ObjectId(adminUserId);
        const loaded = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.getByReference(reconciliationReference);
        const appliedReplay = await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.findLatestApplied(reconciliationReference, action);
        if (appliedReplay) {
            return {
                reconciliation: walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(loaded),
                repair: {
                    operationReference: appliedReplay.operationReference,
                    action: appliedReplay.action,
                    status: appliedReplay.status,
                    repairedFields: appliedReplay.repairedFields,
                    appliedAt: appliedReplay.appliedAt,
                },
            };
        }
        const inspected = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(loaded.topUpReference);
        if (loaded.fingerprint !== inspected.observation.fingerprint ||
            loaded.classification !== inspected.observation.classification) {
            throw this.error("Repair snapshot changed before execution.", "SNAPSHOT_CONFLICT");
        }
        if (!inspected.observation.allowedActions.includes(action)) {
            throw this.error("Repair is not allowed for this classification.", "REPAIR_NOT_ALLOWED");
        }
        const { request, funding, ledger, operation, identity } = inspected.observation;
        if (!funding || !request.providerFundingId || !identity) {
            throw this.error("Repair authority is ambiguous.", "REPAIR_AMBIGUOUS");
        }
        if ((action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK || action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS) && !ledger) {
            throw this.error("A unique valid Ledger entry is required.", "REPAIR_AMBIGUOUS");
        }
        if ((action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK || action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS) &&
            (!ledger || !operation)) {
            throw this.error("A unique valid projection operation is required.", "REPAIR_AMBIGUOUS");
        }
        const operationKey = `${reconciliationReference}:${action}:${request.topUpReference}:${inspected.observation.fingerprint}`;
        const operationReference = (0, topUpOperationalIdentity_util_1.deterministicOperationalReference)("WTRP", operationKey);
        const existing = await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.findByOperationKey(operationKey);
        if (existing) {
            if (existing.action !== action ||
                existing.snapshotFingerprint !== inspected.observation.fingerprint) {
                throw this.error("Repair idempotency identity conflicts.", "REPAIR_CONFLICT");
            }
            return {
                reconciliation: walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(inspected.reconciliation),
                repair: {
                    operationReference: existing.operationReference,
                    action: existing.action,
                    status: existing.status,
                    repairedFields: existing.repairedFields,
                    appliedAt: existing.appliedAt,
                },
            };
        }
        try {
            await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.create({
                operationReference,
                operationKey,
                reconciliationReference,
                topUpReference: request.topUpReference,
                action,
                snapshotFingerprint: inspected.observation.fingerprint,
                actorId,
            });
        }
        catch (error) {
            if (!this.duplicateKey(error))
                throw error;
            const replay = await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.findByOperationKey(operationKey);
            if (!replay)
                throw this.error("Repair operation could not be recovered.", "INTEGRITY_ERROR");
            return {
                reconciliation: walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(inspected.reconciliation),
                repair: {
                    operationReference: replay.operationReference,
                    action: replay.action,
                    status: replay.status,
                    repairedFields: replay.repairedFields,
                    appliedAt: replay.appliedAt,
                },
            };
        }
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference: request.topUpReference,
            reconciliationReference,
            action,
            actorType: "ADMIN",
            actorId,
            result: "SUCCEEDED",
            classificationBefore: inspected.observation.classification,
            reasonCode: "REPAIR_ATTEMPTED",
            metadata: { operationReference },
        });
        const fields = {};
        if ((action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK || action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS) && ledger) {
            if (!request.ledgerEntryId)
                fields.ledgerEntryId = ledger._id;
            if (!request.ledgerReference)
                fields.ledgerReference = ledger.ledgerReference;
        }
        if ((action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK || action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS) && operation) {
            if (!request.walletProjectionOperationId) {
                fields.walletProjectionOperationId = operation._id;
            }
            if (!request.walletProjectionOperationReference) {
                fields.walletProjectionOperationReference = operation.operationReference;
            }
        }
        if (!request.accountingTransactionId)
            fields.accountingTransactionId = identity.transactionId;
        const repairedFields = Object.keys(fields);
        const updated = repairedFields.length
            ? await walletTopUpRequest_repository_1.walletTopUpRequestRepository.repairMissingAccountingLinks({
                topUpReference: request.topUpReference,
                expectedStatus: request.status,
                providerFundingId: funding._id,
                providerFundingReference: funding.fundingReference,
                fields,
            }) : request;
        if (!updated) {
            await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.reject(operationKey, "REPAIR_GUARD_CONFLICT");
            await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
                topUpReference: request.topUpReference,
                reconciliationReference,
                action,
                actorType: "ADMIN",
                actorId,
                result: "REJECTED",
                classificationBefore: inspected.observation.classification,
                reasonCode: "REPAIR_GUARD_CONFLICT",
            });
            throw this.error("Repair guard conflicted with authoritative state.", "REPAIR_CONFLICT");
        }
        const appliedAt = new Date();
        const completedRepair = await walletTopUpRepairOperation_repository_1.walletTopUpRepairOperationRepository.complete(operationKey, repairedFields, appliedAt);
        if (!completedRepair)
            throw this.error("Repair completion state is invalid.", "INTEGRITY_ERROR");
        const after = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(request.topUpReference);
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference: request.topUpReference,
            reconciliationReference,
            action,
            actorType: "ADMIN",
            actorId,
            result: "SUCCEEDED",
            classificationBefore: inspected.observation.classification,
            classificationAfter: after.observation.classification,
            reasonCode: "REPAIR_APPLIED",
            metadata: { operationReference, repairedFieldCount: repairedFields.length },
        });
        return {
            reconciliation: walletTopUpReconciliation_service_1.walletTopUpReconciliationService.toSafeResult(after.reconciliation),
            repair: {
                operationReference,
                action,
                status: completedRepair.status,
                repairedFields,
                appliedAt,
            },
        };
    }
}
exports.WalletTopUpRepairService = WalletTopUpRepairService;
exports.walletTopUpRepairService = new WalletTopUpRepairService();
