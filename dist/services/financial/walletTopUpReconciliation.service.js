"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpReconciliationService = exports.WalletTopUpReconciliationService = void 0;
const mongoose_1 = require("mongoose");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const internalTopUpFunding_repository_1 = require("../../repositories/internalTopUpFunding.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletTopUpReconciliation_repository_1 = require("../../repositories/walletTopUpReconciliation.repository");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const internalTopUpFundingStatus_enum_1 = require("../../enums/financial/internalTopUpFundingStatus.enum");
const walletTopUpReconciliationClassification_enum_1 = require("../../enums/financial/walletTopUpReconciliationClassification.enum");
const walletTopUpReconciliationStatus_enum_1 = require("../../enums/financial/walletTopUpReconciliationStatus.enum");
const walletTopUpReconciliationSeverity_enum_1 = require("../../enums/financial/walletTopUpReconciliationSeverity.enum");
const walletTopUpOperationalAction_enum_1 = require("../../enums/financial/walletTopUpOperationalAction.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const walletTopUpRetryPolicy_1 = require("../../constants/financial/walletTopUpRetryPolicy");
const topUpOperationalIdentity_util_1 = require("../../utils/financial/topUpOperationalIdentity.util");
const WalletTopUpReconciliationError_1 = require("../../errors/financial/WalletTopUpReconciliationError");
const walletTopUpOperationalAudit_service_1 = require("./walletTopUpOperationalAudit.service");
const RETRYABLE = new Set([
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ACCOUNTING_NOT_STARTED,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_ONLY,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_AND_PROJECTION,
    walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING,
]);
class WalletTopUpReconciliationService {
    error(message, code, status = 409) {
        return new WalletTopUpReconciliationError_1.WalletTopUpReconciliationError(message, WalletTopUpReconciliationError_1.WalletTopUpReconciliationErrorCode[code], status);
    }
    classify(input) {
        const { request, funding, ledger, operation, wallet, identity } = input;
        const issues = [];
        const add = (issue) => { if (!issues.includes(issue))
            issues.push(issue); };
        if (!funding)
            add("PROVIDER_FUNDING_NOT_FOUND");
        if (funding && (!request.providerFundingId?.equals(funding._id) ||
            request.providerFundingReference !== funding.fundingReference ||
            !funding.topUpRequestId.equals(request._id) ||
            funding.topUpReference !== request.topUpReference))
            add("REQUEST_PROVIDER_LINK_CONFLICT");
        if (funding && funding.amount !== request.amount)
            add("AMOUNT_CONFLICT");
        if (funding && funding.currency !== request.currency)
            add("CURRENCY_CONFLICT");
        if (!wallet || !wallet._id.equals(request.walletId) || !wallet.userId.equals(request.userId))
            add("WALLET_CONFLICT");
        else if (wallet.currency !== request.currency)
            add("CURRENCY_CONFLICT");
        if (identity && request.accountingTransactionId !== undefined &&
            request.accountingTransactionId !== identity.transactionId)
            add("TRANSACTION_CONFLICT");
        let ledgerValid = false;
        if (ledger && identity && funding) {
            const metadata = ledger.metadata ?? {};
            if (ledger.amount !== request.amount)
                add("AMOUNT_CONFLICT");
            if (ledger.currency !== request.currency)
                add("CURRENCY_CONFLICT");
            if (ledger.transactionId !== identity.transactionId ||
                ledger.type !== ledgerEntryType_enum_1.LedgerEntryType.WALLET_TOP_UP ||
                ledger.source !== ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING ||
                ledger.direction !== moneyDirection_enum_1.MoneyDirection.CREDIT ||
                ledger.account !== ledgerAccount_enum_1.LedgerAccount.CASH ||
                !ledger.userId?.equals(request.userId) ||
                metadata.topUpReference !== request.topUpReference ||
                metadata.providerFundingReference !== funding.fundingReference)
                add("LEDGER_CONFLICT");
            else
                ledgerValid = ledger.amount === request.amount && ledger.currency === request.currency;
            if ((request.ledgerEntryId && !request.ledgerEntryId.equals(ledger._id)) ||
                (request.ledgerReference && request.ledgerReference !== ledger.ledgerReference))
                add("REQUEST_LEDGER_LINK_CONFLICT");
        }
        let projectionValid = false;
        if (operation && !ledger)
            add("ORPHAN_PROJECTION");
        if (operation && ledger && identity) {
            if (operation.deltas.availableBalance !== request.amount)
                add("AMOUNT_CONFLICT");
            if (operation.currency !== request.currency)
                add("CURRENCY_CONFLICT");
            if (operation.operationKey !== identity.operationKey ||
                operation.operationReference !== identity.operationReference ||
                !operation.walletId.equals(request.walletId) ||
                !operation.userId.equals(request.userId) ||
                operation.deltas.reservedBalance !== 0 ||
                operation.deltas.lockedBalance !== 0 ||
                operation.ledgerEntryIds.length !== 1 ||
                !operation.ledgerEntryIds[0].equals(ledger._id) ||
                operation.fingerprint !== (0, topUpOperationalIdentity_util_1.topUpProjectionFingerprint)(request, identity.operationKey, ledger._id.toString()))
                add("PROJECTION_CONFLICT");
            else
                projectionValid = operation.deltas.availableBalance === request.amount &&
                    operation.currency === request.currency && ledgerValid;
            if ((request.walletProjectionOperationId &&
                !request.walletProjectionOperationId.equals(operation._id)) ||
                (request.walletProjectionOperationReference &&
                    request.walletProjectionOperationReference !== operation.operationReference)) {
                add("REQUEST_PROJECTION_LINK_CONFLICT");
            }
        }
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            for (const field of [
                request.providerFundingId, request.providerFundingReference,
                request.ledgerEntryId, request.ledgerReference,
                request.walletProjectionOperationId, request.walletProjectionOperationReference,
                request.accountingTransactionId, request.completedAt ?? request.accountingCompletedAt,
            ])
                if (!field)
                    add("COMPLETED_LINK_MISSING");
            const valid = funding?.status === internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED &&
                ledgerValid && projectionValid && wallet !== null && issues.length === 0;
            return valid
                ? { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.INFO, issues }
                : { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_CORRUPTED, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        }
        if (funding?.status === internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.FAILED) {
            if (!ledger && !operation &&
                [walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING, walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.FAILED].includes(request.status)) {
                return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROVIDER_FAILED, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING, issues };
            }
            add("FAILED_PROVIDER_HAS_ACCOUNTING_EFFECT");
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.UNKNOWN_INTEGRITY_FAILURE, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        }
        if (funding && [internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.CREATED, internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.PROCESSING].includes(funding.status)) {
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.RETRYABLE_PROVIDER_PENDING, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING, issues };
        }
        if (!funding || funding.status !== internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED) {
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.UNKNOWN_INTEGRITY_FAILURE, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        }
        if (issues.includes("AMOUNT_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.AMOUNT_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("CURRENCY_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.CURRENCY_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("TRANSACTION_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.TRANSACTION_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("WALLET_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.WALLET_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.some((issue) => issue.startsWith("REQUEST_")))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.REQUEST_LINK_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("ORPHAN_PROJECTION"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ORPHAN_PROJECTION, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("LEDGER_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (issues.includes("PROJECTION_CONFLICT"))
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROJECTION_CONFLICT, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
        if (!ledger && !operation)
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.ACCOUNTING_NOT_STARTED, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING, issues };
        if (ledgerValid && !operation)
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.LEDGER_ONLY, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING, issues };
        if (ledgerValid && projectionValid)
            return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING, issues };
        return { classification: walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.UNKNOWN_INTEGRITY_FAILURE, severity: walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL, issues };
    }
    actions(classification, requestStatus, issues, ledger, operation) {
        const allowedActions = [walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.INSPECT];
        let recommendedAction;
        if (classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROVIDER_FAILED &&
            requestStatus === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
            allowedActions.push(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE);
            recommendedAction = walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE;
        }
        else if (RETRYABLE.has(classification)) {
            const action = classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETION_PENDING
                ? walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_COMPLETION : walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING;
            allowedActions.push(action);
            recommendedAction = action;
        }
        else if (classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID) {
            allowedActions.push(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION);
            recommendedAction = walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION;
        }
        else if (classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_CORRUPTED &&
            issues.length > 0 &&
            issues.every((issue) => issue === "COMPLETED_LINK_MISSING") &&
            ledger && operation) {
            allowedActions.push(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_LEDGER_LINK, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_PROJECTION_LINK, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION);
            recommendedAction = walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.REPAIR_REQUEST_LINKS;
        }
        else if ([walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL].includes(this.classifySeverity(classification))) {
            allowedActions.push(walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION);
            recommendedAction = walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION;
        }
        return { allowedActions, recommendedAction };
    }
    classifySeverity(classification) {
        if (classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.COMPLETED_VALID ||
            classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.HEALTHY_COMPLETED)
            return walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.INFO;
        if (classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.PROVIDER_FAILED ||
            RETRYABLE.has(classification) ||
            classification === walletTopUpReconciliationClassification_enum_1.WalletTopUpReconciliationClassification.RETRYABLE_PROVIDER_PENDING)
            return walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.WARNING;
        return walletTopUpReconciliationSeverity_enum_1.WalletTopUpReconciliationSeverity.CRITICAL;
    }
    safeResult(reconciliation) {
        const snapshot = reconciliation.snapshot ?? {};
        return {
            reconciliationReference: reconciliation.reconciliationReference,
            topUpReference: reconciliation.topUpReference,
            classification: reconciliation.classification,
            status: reconciliation.status,
            severity: reconciliation.severity,
            providerFundingReference: reconciliation.providerFundingReference,
            requestStatus: snapshot.requestStatus,
            providerStatus: snapshot.providerStatus,
            ledgerReference: snapshot.discoveredLedgerReference,
            projectionOperationReference: snapshot.discoveredProjectionReference,
            accountingTransactionId: snapshot.derivedAccountingTransactionId,
            amount: snapshot.amount,
            currency: snapshot.currency,
            issueCodes: reconciliation.detectedIssues,
            recommendedAction: reconciliation.recommendedAction,
            allowedActions: reconciliation.allowedActions,
            retry: {
                count: reconciliation.retryCount,
                max: reconciliation.maxRetryCount,
                nextRetryAt: reconciliation.nextRetryAt,
                lastRetryAt: reconciliation.lastRetryAt,
                lastRetryCode: reconciliation.lastRetryCode,
            },
            resolution: reconciliation.resolvedAt ? {
                action: reconciliation.resolutionAction,
                code: reconciliation.resolutionCode,
                note: reconciliation.resolutionNote,
                resolvedAt: reconciliation.resolvedAt,
            } : undefined,
            detectedAt: reconciliation.detectedAt,
            lastInspectedAt: reconciliation.lastInspectedAt,
            createdAt: reconciliation.createdAt,
            updatedAt: reconciliation.updatedAt,
        };
    }
    async inspectForOperation(topUpReference) {
        const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
        if (!request)
            throw this.error("Top-up request was not found.", "REQUEST_NOT_FOUND", 404);
        const funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByTopUpRequestId(request._id);
        const identity = funding ? (0, topUpOperationalIdentity_util_1.deriveTopUpOperationalAccountingIdentity)(request, funding) : null;
        const [ledger, operation, wallet] = await Promise.all([
            identity ? ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(identity.postingKey) : Promise.resolve(null),
            identity ? walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.operationKey) : Promise.resolve(null),
            wallet_repository_1.walletRepository.findById(request.walletId),
        ]);
        const classified = this.classify({ request, funding, ledger, operation, wallet, identity });
        const actionData = this.actions(classified.classification, request.status, classified.issues, ledger, operation);
        const snapshot = {
            requestStatus: request.status,
            providerStatus: funding?.status,
            requestProviderFundingReference: request.providerFundingReference,
            requestLedgerReference: request.ledgerReference,
            requestProjectionReference: request.walletProjectionOperationReference,
            requestAccountingTransactionId: request.accountingTransactionId,
            derivedAccountingTransactionId: identity?.transactionId,
            discoveredLedgerReference: ledger?.ledgerReference,
            discoveredProjectionReference: operation?.operationReference,
            amount: request.amount,
            currency: request.currency,
            walletReference: request.walletId.toString(),
            classification: classified.classification,
            issueCodes: classified.issues,
        };
        const fingerprint = (0, topUpOperationalIdentity_util_1.deterministicSnapshotFingerprint)(snapshot);
        const existing = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.findByTopUpRequestId(request._id);
        const status = existing?.status === walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.IN_PROGRESS
            ? walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.IN_PROGRESS
            : existing && existing.fingerprint === fingerprint &&
                [
                    walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.ACKNOWLEDGED,
                    walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.FAILED,
                    walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED,
                ].includes(existing.status)
                ? existing.status : walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.OPEN;
        const now = new Date();
        const reconciliation = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.upsertObservation({
            reconciliationReference: (0, topUpOperationalIdentity_util_1.deterministicOperationalReference)("WTR", request.topUpReference),
            reconciliationKey: `wallet-top-up-reconciliation:${request.topUpReference}`,
            topUpRequestId: request._id,
            topUpReference: request.topUpReference,
            userId: request.userId,
            walletId: request.walletId,
            providerFundingId: funding?._id,
            providerFundingReference: funding?.fundingReference,
            classification: classified.classification,
            status,
            severity: classified.severity,
            detectedIssues: classified.issues,
            detectedAt: existing?.detectedAt ?? now,
            lastInspectedAt: now,
            recommendedAction: actionData.recommendedAction,
            allowedActions: actionData.allowedActions,
            maxRetryCount: walletTopUpRetryPolicy_1.WALLET_TOP_UP_RETRY_POLICY.MAX_ACCOUNTING_RETRIES,
            snapshot,
            fingerprint,
        });
        const observation = {
            request, funding, ledger, operation, wallet, identity,
            classification: classified.classification,
            severity: classified.severity,
            issues: classified.issues,
            allowedActions: actionData.allowedActions,
            recommendedAction: actionData.recommendedAction,
            snapshot,
            fingerprint,
        };
        return { reconciliation, observation };
    }
    async inspect(topUpReference, adminUserId) {
        const result = await this.inspectForOperation(topUpReference);
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference,
            reconciliationReference: result.reconciliation.reconciliationReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.INSPECT,
            actorType: "ADMIN",
            actorId: new mongoose_1.Types.ObjectId(adminUserId),
            result: "SUCCEEDED",
            classificationAfter: result.observation.classification,
            reasonCode: "RECONCILIATION_INSPECTED",
        });
        return this.safeResult(result.reconciliation);
    }
    async getByReference(reference) {
        const reconciliation = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.findByReference(reference);
        if (!reconciliation)
            throw this.error("Top-up reconciliation was not found.", "NOT_FOUND", 404);
        return reconciliation;
    }
    toSafeResult(reconciliation) {
        return this.safeResult(reconciliation);
    }
    async list(input) {
        const page = input.page === undefined ? 1 : Number(input.page);
        const limit = input.limit === undefined ? 25 : Number(input.limit);
        if (!Number.isSafeInteger(page) || page < 1 ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw this.error("Invalid reconciliation pagination.", "INVALID_ACTION", 400);
        }
        const result = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.list({ ...input, page, limit });
        return {
            items: result.items.map((item) => this.safeResult(item)),
            pagination: { page, limit, total: result.total },
        };
    }
    async updateStatus(input) {
        if (![walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION, walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION].includes(input.action)) {
            throw this.error("Invalid reconciliation status action.", "INVALID_ACTION");
        }
        const loaded = await this.getByReference(input.reconciliationReference);
        if (loaded.status === walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED ||
            loaded.status === walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.ACKNOWLEDGED) {
            if (loaded.resolutionAction === input.action &&
                loaded.resolutionCode === input.resolutionCode &&
                (loaded.resolutionNote ?? undefined) === (input.resolutionNote ?? undefined)) {
                return this.safeResult(loaded);
            }
            throw this.error("Reconciliation is already resolved.", "ALREADY_RESOLVED");
        }
        const inspected = await this.inspectForOperation(loaded.topUpReference);
        if (loaded.fingerprint !== inspected.observation.fingerprint ||
            loaded.classification !== inspected.observation.classification) {
            throw this.error("Reconciliation changed before status update.", "SNAPSHOT_CONFLICT");
        }
        if (!inspected.observation.allowedActions.includes(input.action)) {
            throw this.error("Status action is not allowed for this classification.", "INVALID_ACTION");
        }
        const actorId = new mongoose_1.Types.ObjectId(input.adminUserId);
        const updated = await walletTopUpReconciliation_repository_1.walletTopUpReconciliationRepository.updateResolution({
            reconciliationReference: input.reconciliationReference,
            fingerprint: inspected.observation.fingerprint,
            expectedStatuses: [
                walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.OPEN,
                walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RETRY_SCHEDULED,
                walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.FAILED,
            ],
            status: input.action === walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION
                ? walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.RESOLVED : walletTopUpReconciliationStatus_enum_1.WalletTopUpReconciliationStatus.ACKNOWLEDGED,
            action: input.action,
            code: input.resolutionCode,
            note: input.resolutionNote,
            at: new Date(),
            actorId,
        });
        if (!updated)
            throw this.error("Reconciliation status guard conflicted.", "SNAPSHOT_CONFLICT");
        await walletTopUpOperationalAudit_service_1.walletTopUpOperationalAuditService.record({
            topUpReference: loaded.topUpReference,
            reconciliationReference: input.reconciliationReference,
            action: input.action,
            actorType: "ADMIN",
            actorId,
            result: "SUCCEEDED",
            classificationBefore: loaded.classification,
            classificationAfter: inspected.observation.classification,
            reasonCode: input.resolutionCode,
        });
        return this.safeResult(await this.getByReference(input.reconciliationReference));
    }
}
exports.WalletTopUpReconciliationService = WalletTopUpReconciliationService;
exports.walletTopUpReconciliationService = new WalletTopUpReconciliationService();
