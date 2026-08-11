"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionOperationalInspectionService = exports.WalletConversionOperationalInspectionService = void 0;
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionOperationalClassification_enum_1 = require("../../enums/financial/walletConversionOperationalClassification.enum");
const walletConversionOperationalIssue_enum_1 = require("../../enums/financial/walletConversionOperationalIssue.enum");
const walletConversionOperationalSeverity_enum_1 = require("../../enums/financial/walletConversionOperationalSeverity.enum");
const walletConversionProviderOutcome_enum_1 = require("../../enums/financial/walletConversionProviderOutcome.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionOperationalError_1 = require("../../errors/financial/WalletConversionOperationalError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const walletConversionAccountingIdentity_util_1 = require("../../utils/financial/walletConversionAccountingIdentity.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletConversionAccounting_service_1 = require("./walletConversionAccounting.service");
const walletConversionProviderExecution_service_1 = require("./walletConversionProviderExecution.service");
const walletConversionRequest_service_1 = require("./walletConversionRequest.service");
const codeOf = (error) => error?.code ?? "";
class WalletConversionOperationalInspectionService {
    result(request, classification, issues, graph) {
        const severity = classification === walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY
            ? walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.INFO : [walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.PENDING,
            walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED,
            walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.MISSING_AUDIT].includes(classification)
            ? walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.WARNING : walletConversionOperationalSeverity_enum_1.WalletConversionOperationalSeverity.CRITICAL;
        return { request, classification, severity, issues, graph };
    }
    async request(reference) {
        if (typeof reference !== "string" ||
            !(0, reference_util_1.hasReferenceType)(reference.trim(), "WALLET_CONVERSION")) {
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion operational input is invalid.", "WALLET_CONVERSION_OPERATIONAL_INVALID_INPUT");
        }
        const request = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(reference.trim());
        if (!request)
            throw new WalletConversionOperationalError_1.WalletConversionOperationalError("Wallet conversion request was not found.", "WALLET_CONVERSION_OPERATIONAL_REQUEST_NOT_FOUND");
        return request;
    }
    classifyRequestError(request, error) {
        const code = codeOf(error);
        if (code.includes("SNAPSHOT") || code.includes("FX_")) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_SNAPSHOT, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.SNAPSHOT_CONFLICT]);
        }
        if (code.includes("WALLET"))
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.INTEGRITY_FAILURE, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.WALLET_INVARIANT_CONFLICT]);
        return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_REQUEST, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.REQUEST_IDENTITY_CONFLICT]);
    }
    async proveSuccessGraph(request) {
        try {
            await walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.validateReplay(request.conversionReference, walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS, { allowAccountingTerminal: true });
        }
        catch {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_PROVIDER, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROVIDER_CONFLICT]);
        }
        const targetWallet = request.accountingTargetWalletId
            ? await wallet_repository_1.walletRepository.findById(request.accountingTargetWalletId)
            : request.targetWalletId
                ? await wallet_repository_1.walletRepository.findById(request.targetWalletId)
                : await wallet_repository_1.walletRepository.findByUserAndCurrency(request.userId, request.targetCurrency);
        const sourceWallet = await wallet_repository_1.walletRepository.findById(request.sourceWalletId);
        if (!sourceWallet || !targetWallet ||
            !sourceWallet.userId.equals(request.userId) ||
            !targetWallet.userId.equals(request.userId) ||
            sourceWallet.currency !== request.sourceCurrency ||
            targetWallet.currency !== request.targetCurrency ||
            sourceWallet._id.equals(targetWallet._id) ||
            sourceWallet.currentBalance !== sourceWallet.availableBalance +
                sourceWallet.reservedBalance + sourceWallet.lockedBalance ||
            targetWallet.currentBalance !== targetWallet.availableBalance +
                targetWallet.reservedBalance + targetWallet.lockedBalance) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.INTEGRITY_FAILURE, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.WALLET_INVARIANT_CONFLICT]);
        }
        if (!request.providerRequestReference ||
            !request.providerExecutionReference)
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_PROVIDER, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROVIDER_CONFLICT]);
        const identity = (0, walletConversionAccountingIdentity_util_1.deriveWalletConversionAccountingIdentity)({
            conversionReference: request.conversionReference,
            conversionKey: request.conversionKey,
            providerRequestReference: request.providerRequestReference,
            providerExecutionReference: request.providerExecutionReference,
            fxSnapshotReference: request.fxSnapshotReference,
            userId: request.userId, sourceWalletId: request.sourceWalletId,
            targetWalletId: targetWallet._id,
            sourceCurrency: request.sourceCurrency,
            targetCurrency: request.targetCurrency,
            sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
        });
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.accountingTransactionReference,
        });
        const sourceEntry = entries.find((entry) => entry.postingKey === identity.sourcePostingKey);
        const targetEntry = entries.find((entry) => entry.postingKey === identity.targetPostingKey);
        const common = (entry) => entry &&
            entry.transactionId === identity.accountingTransactionReference &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.WALLET_CONVERSION_COMPLETED &&
            entry.source === ledgerSource_enum_1.LedgerSource.WALLET_CONVERSION &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.userId?.equals(request.userId) &&
            entry.metadata?.conversionReference === request.conversionReference &&
            entry.metadata?.accountingReference === identity.accountingReference &&
            entry.metadata?.providerExecutionReference ===
                request.providerExecutionReference &&
            entry.metadata?.fxSnapshotReference === request.fxSnapshotReference;
        if (entries.length !== 2 || !common(sourceEntry) || !common(targetEntry) ||
            sourceEntry.direction !== moneyDirection_enum_1.MoneyDirection.DEBIT ||
            !sourceEntry.walletId?.equals(request.sourceWalletId) ||
            sourceEntry.amount !== request.sourceAmount ||
            sourceEntry.currency !== request.sourceCurrency ||
            targetEntry.direction !== moneyDirection_enum_1.MoneyDirection.CREDIT ||
            !targetEntry.walletId?.equals(targetWallet._id) ||
            targetEntry.amount !== request.targetAmount ||
            targetEntry.currency !== request.targetCurrency) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_LEDGER, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.LEDGER_CONFLICT]);
        }
        const [sourceProjection, targetProjection] = await Promise.all([
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.sourceProjectionKey),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.targetProjectionKey),
        ]);
        if (!sourceProjection || !targetProjection ||
            sourceProjection.operationReference !==
                identity.sourceProjectionReference ||
            targetProjection.operationReference !==
                identity.targetProjectionReference ||
            !sourceProjection.walletId.equals(request.sourceWalletId) ||
            !targetProjection.walletId.equals(targetWallet._id) ||
            !sourceProjection.userId.equals(request.userId) ||
            !targetProjection.userId.equals(request.userId) ||
            sourceProjection.currency !== request.sourceCurrency ||
            targetProjection.currency !== request.targetCurrency ||
            sourceProjection.deltas.availableBalance !== -request.sourceAmount ||
            targetProjection.deltas.availableBalance !== request.targetAmount ||
            sourceProjection.deltas.reservedBalance !== 0 ||
            targetProjection.deltas.reservedBalance !== 0 ||
            sourceProjection.deltas.lockedBalance !== 0 ||
            targetProjection.deltas.lockedBalance !== 0 ||
            sourceProjection.ledgerEntryIds.length !== 1 ||
            targetProjection.ledgerEntryIds.length !== 1 ||
            !sourceProjection.ledgerEntryIds[0].equals(sourceEntry._id) ||
            !targetProjection.ledgerEntryIds[0].equals(targetEntry._id) ||
            sourceWallet.projectionVersion < sourceProjection.projectionVersion ||
            targetWallet.projectionVersion < targetProjection.projectionVersion) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_PROJECTION, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROJECTION_CONFLICT]);
        }
        const audits = await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference: request.conversionReference,
            action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED,
        });
        const completedAt = request.completedAt ?? audits[0]?.completedAt;
        const graph = {
            request, identity, targetWalletId: targetWallet._id,
            sourceWalletVersion: sourceProjection.projectionVersion,
            targetWalletVersion: targetProjection.projectionVersion, completedAt,
        };
        const accountingMissing = !request.accountingReference ||
            !request.accountingKey || !request.accountingFingerprint ||
            !request.accountingTargetWalletId || !request.sourceWalletVersion ||
            !request.targetWalletVersion || !request.completedAt;
        const ledgerMissing = !request.accountingTransactionReference;
        const projectionMissing = !request.sourceProjectionReference ||
            !request.targetProjectionReference;
        const existingConflict = (!!request.accountingReference &&
            request.accountingReference !== identity.accountingReference) ||
            (!!request.accountingKey && request.accountingKey !== identity.accountingKey) ||
            (!!request.accountingFingerprint && request.accountingFingerprint !==
                identity.accountingFingerprint) ||
            (!!request.accountingTransactionReference &&
                request.accountingTransactionReference !==
                    identity.accountingTransactionReference) ||
            (!!request.accountingTargetWalletId &&
                !request.accountingTargetWalletId.equals(targetWallet._id)) ||
            (!!request.sourceProjectionReference &&
                request.sourceProjectionReference !== identity.sourceProjectionReference) ||
            (!!request.targetProjectionReference &&
                request.targetProjectionReference !== identity.targetProjectionReference) ||
            (!!request.sourceWalletVersion && request.sourceWalletVersion !==
                sourceProjection.projectionVersion) ||
            (!!request.targetWalletVersion && request.targetWalletVersion !==
                targetProjection.projectionVersion);
        if (existingConflict)
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_REQUEST, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.REQUEST_IDENTITY_CONFLICT], graph);
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED) {
            if (accountingMissing || ledgerMissing || projectionMissing ||
                audits.length !== 1)
                return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.INTEGRITY_FAILURE, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.REQUEST_IDENTITY_CONFLICT], graph);
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.ACCOUNTING_COMPLETION_REPLAY_REQUIRED], graph);
        }
        if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_REQUEST, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.REQUEST_IDENTITY_CONFLICT], graph);
        }
        const missingIssues = [];
        if (accountingMissing)
            missingIssues.push(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.ACCOUNTING_REFERENCES_MISSING);
        if (ledgerMissing)
            missingIssues.push(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.LEDGER_REFERENCES_MISSING);
        if (projectionMissing)
            missingIssues.push(walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROJECTION_REFERENCES_MISSING);
        if (missingIssues.length)
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.REPLAY_REQUIRED, missingIssues, graph);
        if (audits.length === 0)
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.MISSING_AUDIT, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.TERMINAL_AUDIT_MISSING], graph);
        if (audits.length !== 1 ||
            audits[0].accountingReference !== identity.accountingReference ||
            audits[0].transactionReference !== identity.accountingTransactionReference ||
            audits[0].sourceProjectionReference !== identity.sourceProjectionReference ||
            audits[0].targetProjectionReference !== identity.targetProjectionReference ||
            audits[0].sourceWalletVersion !== sourceProjection.projectionVersion ||
            audits[0].targetWalletVersion !== targetProjection.projectionVersion ||
            audits[0].completedAt?.getTime() !== request.completedAt?.getTime()) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.INTEGRITY_FAILURE, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.AUDIT_CONFLICT], graph);
        }
        return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, [], graph);
    }
    async inspect(reference) {
        const request = await this.request(reference);
        try {
            await walletConversionRequest_service_1.walletConversionRequestService.validateStoredAuthority(request, { checkSourceBalance: false, requireSnapshotEligible: false });
        }
        catch (error) {
            return this.classifyRequestError(request, error);
        }
        if ([walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING,
            walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED].includes(request.status) ||
            (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED &&
                request.providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS)) {
            return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.PENDING, []);
        }
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED) {
            try {
                await walletConversionAccounting_service_1.walletConversionAccountingService.validateReplay(request.conversionReference);
                return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.HEALTHY, []);
            }
            catch (error) {
                const code = codeOf(error);
                if (code.includes("PROVIDER"))
                    return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.CORRUPTED_PROVIDER, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.PROVIDER_CONFLICT]);
                if (code.includes("AUDIT"))
                    return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.MISSING_AUDIT, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.TERMINAL_AUDIT_MISSING]);
                return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.INTEGRITY_FAILURE, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.REQUEST_IDENTITY_CONFLICT]);
            }
        }
        if (request.providerOutcome === walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS) {
            return this.proveSuccessGraph(request);
        }
        return this.result(request, walletConversionOperationalClassification_enum_1.WalletConversionOperationalClassification.UNKNOWN, [walletConversionOperationalIssue_enum_1.WalletConversionOperationalIssue.UNKNOWN_CONFLICT]);
    }
}
exports.WalletConversionOperationalInspectionService = WalletConversionOperationalInspectionService;
exports.walletConversionOperationalInspectionService = new WalletConversionOperationalInspectionService();
