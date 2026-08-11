"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalOperationalInspectionService = exports.CreatorWithdrawalOperationalInspectionService = void 0;
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalFinalizationOutcome_enum_1 = require("../../enums/financial/creatorWithdrawalFinalizationOutcome.enum");
const creatorWithdrawalOperationalAction_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalAction.enum");
const creatorWithdrawalOperationalClassification_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalClassification.enum");
const creatorWithdrawalOperationalSeverity_enum_1 = require("../../enums/financial/creatorWithdrawalOperationalSeverity.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const CreatorWithdrawalOperationalError_1 = require("../../errors/financial/CreatorWithdrawalOperationalError");
const auditLog_model_1 = require("../../models/auditLog.model");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const wallet_model_1 = require("../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../models/walletProjectionOperation.model");
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const internalWithdrawalProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWithdrawalProviderRequest.repository");
const creatorWithdrawalFinalizationIdentity_util_1 = require("../../utils/financial/creatorWithdrawalFinalizationIdentity.util");
const creatorWithdrawalOperationalIdentity_util_1 = require("../../utils/financial/creatorWithdrawalOperationalIdentity.util");
const withdrawalProviderIdentity_util_1 = require("../../utils/financial/withdrawalProviderIdentity.util");
const creatorWithdrawalFinalization_service_1 = require("./creatorWithdrawalFinalization.service");
const withdrawalProviderInitialization_service_1 = require("./withdrawalProviderInitialization.service");
const withdrawalProviderExecution_service_1 = require("./withdrawalProviderExecution.service");
const corruptSeverity = new Set([
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_RESERVATION_LEDGER,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_RESERVATION_PROJECTION,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_FINALIZATION_LEDGER,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_FINALIZATION_PROJECTION,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_WALLET,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.TRANSACTION_CONFLICT,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.OUTCOME_CONFLICT,
    creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.INTEGRITY_FAILURE,
]);
class CreatorWithdrawalOperationalInspectionService {
    providerIdentityValid(withdrawal, provider) {
        try {
            const identity = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderIdentity)({
                withdrawalReference: withdrawal.withdrawalReference,
                creatorId: withdrawal.creatorId,
                creatorReference: provider.creatorReference,
                walletId: withdrawal.walletId,
                destinationReference: withdrawal.destinationReference,
                currency: withdrawal.currency,
                amount: withdrawal.amount,
            });
            const execution = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderExecutionIdentity)({
                providerRequestReference: provider.providerRequestReference,
                providerRequestKey: provider.providerRequestKey,
                providerReference: provider.providerReference,
                providerFingerprint: provider.providerFingerprint,
            });
            return withdrawal.providerRequestReference ===
                provider.providerRequestReference &&
                provider.providerRequestReference === identity.providerRequestReference &&
                provider.providerRequestKey === identity.providerRequestKey &&
                provider.providerReference === identity.providerReference &&
                provider.providerFingerprint === identity.providerFingerprint &&
                (!provider.executionReference ||
                    provider.executionReference === execution.executionReference) &&
                (!provider.executionFingerprint ||
                    provider.executionFingerprint === execution.executionFingerprint);
        }
        catch {
            return false;
        }
    }
    expectedFinalization(withdrawal, provider) {
        if (!withdrawal.ledgerTransactionReference || !provider.executionReference ||
            !provider.executionFingerprint || ![
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
        ].includes(provider.providerStatus))
            return undefined;
        const outcome = provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            : creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED;
        return (0, creatorWithdrawalFinalizationIdentity_util_1.deriveCreatorWithdrawalFinalizationIdentity)({
            withdrawalReference: withdrawal.withdrawalReference,
            withdrawalKey: withdrawal.withdrawalKey,
            creatorId: withdrawal.creatorId,
            creatorUserId: withdrawal.creatorUserId,
            walletId: withdrawal.walletId,
            destinationId: withdrawal.destinationId,
            destinationReference: withdrawal.destinationReference,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            providerRequestReference: provider.providerRequestReference,
            providerRequestKey: provider.providerRequestKey,
            providerFingerprint: provider.providerFingerprint,
            providerReference: provider.providerReference,
            providerExecutionReference: provider.executionReference,
            providerExecutionFingerprint: provider.executionFingerprint,
            providerTerminalStatus: provider.providerStatus,
            reservationTransactionId: withdrawal.ledgerTransactionReference,
            outcome,
        });
    }
    async inspect(withdrawalReference, session) {
        const withdrawal = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference, session);
        if (!withdrawal)
            throw new CreatorWithdrawalOperationalError_1.CreatorWithdrawalOperationalError("Creator withdrawal was not found.", "CREATOR_WITHDRAWAL_OPERATIONAL_WITHDRAWAL_NOT_FOUND");
        const provider = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository
            .findByWithdrawal(withdrawalReference, session) ?? undefined;
        const wallet = await wallet_model_1.Wallet.findById(withdrawal.walletId)
            .session(session ?? null);
        const issues = [];
        const add = (code) => {
            if (!issues.includes(code))
                issues.push(code);
        };
        let reservationValid = true;
        try {
            await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService
                .validateReservationAuthority(withdrawalReference);
        }
        catch (error) {
            reservationValid = false;
            const code = error.code ?? "RESERVATION_CONFLICT";
            add(code.includes("PROJECTION")
                ? "RESERVATION_PROJECTION_CONFLICT"
                : "RESERVATION_LEDGER_CONFLICT");
        }
        if (!provider)
            add("PROVIDER_NOT_FOUND");
        if (provider && withdrawal.providerRequestReference !==
            provider.providerRequestReference)
            add("REQUEST_LINK_CONFLICT");
        if (provider && provider.amount !== withdrawal.amount)
            add("AMOUNT_CONFLICT");
        if (provider && provider.currency !== withdrawal.currency)
            add("CURRENCY_CONFLICT");
        if (provider && provider.destinationReference !==
            withdrawal.destinationReference)
            add("DESTINATION_CONFLICT");
        if (provider && !this.providerIdentityValid(withdrawal, provider)) {
            add("PROVIDER_IDENTITY_CONFLICT");
        }
        let providerExecutionGraphValid = true;
        if (provider && [internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED]
            .includes(provider.providerStatus)) {
            try {
                await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.validateReplay(withdrawalReference);
            }
            catch {
                providerExecutionGraphValid = false;
                add("PROVIDER_EXECUTION_CONFLICT");
            }
        }
        const walletValid = !!wallet &&
            wallet.userId.equals(withdrawal.creatorUserId) &&
            wallet.currency === withdrawal.currency &&
            wallet.currentBalance === wallet.availableBalance +
                wallet.reservedBalance + wallet.lockedBalance;
        if (!walletValid)
            add("WALLET_CONFLICT");
        const terminalOutcomeConflict = !!provider &&
            [creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
                creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
            ((provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED &&
                withdrawal.status !== creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED) ||
                (provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED &&
                    withdrawal.status !== creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED));
        const identity = provider
            ? this.expectedFinalization(withdrawal, provider) : undefined;
        const entries = identity ? await ledgerEntry_model_1.LedgerEntry.find({
            transactionId: identity.finalizationTransactionId,
        }).select("+postingKey").session(session ?? null) : [];
        const type = provider?.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_COMPLETED
            : ledgerEntryType_enum_1.LedgerEntryType.CREATOR_WITHDRAWAL_FAILED_RELEASED;
        const outcome = provider?.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            : creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED;
        const ledgerValid = !!identity && entries.length === 2 && entries.every((entry) => entry.type === type &&
            entry.source === ledgerSource_enum_1.LedgerSource.WITHDRAWAL_PROVIDER_FINALIZATION &&
            entry.userId?.equals(withdrawal.creatorUserId) &&
            entry.amount === withdrawal.amount && entry.currency === withdrawal.currency) && !!entries.find((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED &&
            entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
            entry.walletId?.equals(withdrawal.walletId) &&
            entry.postingKey === identity.reservedDebitPostingKey) &&
            !!entries.find((entry) => entry.account === (outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                ? ledgerAccount_enum_1.LedgerAccount.PAYOUT_CLEARING : ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE) &&
                entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
                entry.postingKey === identity.terminalCreditPostingKey);
        const projection = identity
            ? await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
                operationKey: identity.projectionOperationKey,
            }).select("+fingerprint").session(session ?? null) : null;
        const entryIds = entries.map((entry) => entry._id);
        const entrySet = new Set(entryIds.map(String));
        const projectionValid = !!projection && ledgerValid &&
            projection.operationReference === identity?.projectionReference &&
            projection.walletId.equals(withdrawal.walletId) &&
            projection.userId.equals(withdrawal.creatorUserId) &&
            projection.currency === withdrawal.currency &&
            projection.deltas.availableBalance ===
                (outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED
                    ? withdrawal.amount : 0) &&
            projection.deltas.reservedBalance === -withdrawal.amount &&
            projection.deltas.lockedBalance === 0 &&
            projection.ledgerEntryIds.length === 2 &&
            projection.ledgerEntryIds.every((id) => entrySet.has(id.toString()));
        const auditAction = outcome === creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
            ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_COMPLETED
            : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FAILED;
        const auditCount = identity ? await auditLog_model_1.AuditLog.countDocuments({
            action: auditAction,
            entityId: withdrawal._id,
            "financialContext.withdrawalReference": withdrawalReference,
            "financialContext.ledgerTransactionReference": identity.finalizationTransactionId,
        }).session(session ?? null) : 0;
        const missingFields = [];
        let finalizationLinkConflict = false;
        if (identity) {
            if (!withdrawal.finalizationOutcome)
                missingFields.push("finalizationOutcome");
            if (!withdrawal.finalizationReference)
                missingFields.push("finalizationReference");
            if (!withdrawal.finalizationKey)
                missingFields.push("finalizationKey");
            if (!withdrawal.finalizationTransactionId)
                missingFields.push("finalizationTransactionId");
            if (withdrawal.finalizationLedgerEntryIds.length === 0) {
                missingFields.push("finalizationLedgerEntryIds");
            }
            if (!withdrawal.finalizationProjectionOperationId) {
                missingFields.push("finalizationProjectionOperationId");
            }
            if (!withdrawal.finalizationProjectionOperationReference) {
                missingFields.push("finalizationProjectionOperationReference");
            }
            if (!withdrawal.finalizationFingerprint)
                missingFields.push("finalizationFingerprint");
            if (!withdrawal.providerTerminalReference)
                missingFields.push("providerTerminalReference");
            finalizationLinkConflict =
                (!!withdrawal.finalizationOutcome &&
                    withdrawal.finalizationOutcome !== outcome) ||
                    (!!withdrawal.finalizationReference &&
                        withdrawal.finalizationReference !== identity.finalizationReference) ||
                    (!!withdrawal.finalizationKey &&
                        withdrawal.finalizationKey !== identity.finalizationKey) ||
                    (!!withdrawal.finalizationTransactionId &&
                        withdrawal.finalizationTransactionId !==
                            identity.finalizationTransactionId) ||
                    (!!withdrawal.finalizationProjectionOperationReference &&
                        withdrawal.finalizationProjectionOperationReference !==
                            identity.projectionReference) ||
                    (!!withdrawal.finalizationFingerprint &&
                        withdrawal.finalizationFingerprint !==
                            identity.finalizationFingerprint) ||
                    (!!withdrawal.providerTerminalReference &&
                        withdrawal.providerTerminalReference !== provider?.executionReference);
            if (finalizationLinkConflict)
                add("FINALIZATION_LINK_CONFLICT");
        }
        let classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.UNKNOWN;
        if (!reservationValid)
            classification = issues.includes("RESERVATION_PROJECTION_CONFLICT")
                ? creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_RESERVATION_PROJECTION
                : creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_RESERVATION_LEDGER;
        else if (!provider)
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_PROVIDER;
        else if (issues.includes("REQUEST_LINK_CONFLICT"))
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.REQUEST_LINK_CONFLICT;
        else if (issues.includes("AMOUNT_CONFLICT"))
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.AMOUNT_CONFLICT;
        else if (issues.includes("CURRENCY_CONFLICT"))
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CURRENCY_CONFLICT;
        else if (issues.includes("DESTINATION_CONFLICT"))
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.DESTINATION_CONFLICT;
        else if (issues.includes("PROVIDER_IDENTITY_CONFLICT"))
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.PROVIDER_IDENTITY_CONFLICT;
        else if (!walletValid)
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_WALLET;
        else if (terminalOutcomeConflict)
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.OUTCOME_CONFLICT;
        else if (!providerExecutionGraphValid)
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_PROVIDER;
        else if (withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED) {
            try {
                await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.validateReplay(withdrawalReference);
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.PROVIDER_INITIALIZED;
            }
            catch {
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_PROVIDER;
            }
        }
        else if (withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING) {
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.PROVIDER_PROCESSING;
        }
        else if (withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            [internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED].includes(provider.providerStatus)) {
            if (entries.length || projection || auditCount) {
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.TRANSACTION_CONFLICT;
            }
            else {
                classification = provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                    ? creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_SUCCESS
                    : creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_FAILURE;
            }
        }
        else if ([creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status)) {
            const expectedStatus = provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                ? creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED
                : creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED;
            if (withdrawal.status !== expectedStatus)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.OUTCOME_CONFLICT;
            else if (finalizationLinkConflict)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.TRANSACTION_CONFLICT;
            else if (!ledgerValid)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_FINALIZATION_LEDGER;
            else if (!projectionValid)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_FINALIZATION_PROJECTION;
            else if (missingFields.length)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_FINALIZATION_LINKS;
            else if (auditCount === 0)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_AUDIT;
            else if (auditCount !== 1)
                classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_AUDIT;
            else {
                classification = provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                    ? creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.COMPLETED_REPLAY_REQUIRED
                    : creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FAILED_REPLAY_REQUIRED;
                try {
                    await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.validateReplay(withdrawalReference);
                    classification = provider.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                        ? creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_COMPLETED : creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_FAILED;
                }
                catch {
                    add("FINALIZATION_REPLAY_CONFLICT");
                }
            }
        }
        else
            classification = creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.CORRUPTED_WITHDRAWAL;
        if (entries.length && !ledgerValid)
            add("FINALIZATION_LEDGER_CONFLICT");
        if (projection && !projectionValid)
            add("FINALIZATION_PROJECTION_CONFLICT");
        if ([creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
            missingFields.length)
            add("MISSING_FINALIZATION_LINKS");
        if ([creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
            creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED].includes(withdrawal.status) &&
            identity && auditCount === 0)
            add("TERMINAL_AUDIT_MISSING");
        const healthy = [creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_COMPLETED,
            creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.HEALTHY_FAILED].includes(classification);
        const pending = [creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_SUCCESS,
            creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.FINALIZATION_PENDING_FAILURE].includes(classification);
        const repairLinks = classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_FINALIZATION_LINKS;
        const repairAudit = classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.MISSING_AUDIT;
        const severity = healthy ? creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.INFO
            : pending || classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.PROVIDER_INITIALIZED ||
                classification === creatorWithdrawalOperationalClassification_enum_1.CreatorWithdrawalOperationalClassification.PROVIDER_PROCESSING ? creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.WARNING
                : repairLinks || repairAudit ? creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.ERROR
                    : corruptSeverity.has(classification) ? creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.CRITICAL : creatorWithdrawalOperationalSeverity_enum_1.CreatorWithdrawalOperationalSeverity.ERROR;
        const allowedActions = [creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.INSPECT];
        if (pending)
            allowedActions.push(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RETRY_FINALIZATION);
        if (repairLinks)
            allowedActions.push(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS);
        if (repairAudit)
            allowedActions.push(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT);
        allowedActions.push(creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE, creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE);
        const recommendedAction = pending ? creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RETRY_FINALIZATION
            : repairLinks ? creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_FINALIZATION_LINKS
                : repairAudit ? creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESTORE_TERMINAL_AUDIT
                    : healthy ? creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.RESOLVE : creatorWithdrawalOperationalAction_enum_1.CreatorWithdrawalOperationalAction.ACKNOWLEDGE;
        const snapshot = {
            withdrawalReference: withdrawal.withdrawalReference,
            withdrawalStatus: withdrawal.status,
            providerRequestReference: provider?.providerRequestReference,
            providerStatus: provider?.providerStatus,
            providerOutcome: provider?.terminalResult?.outcome,
            reservationTransactionReference: withdrawal.ledgerTransactionReference,
            reservationProjectionReference: withdrawal.projectionReference,
            finalizationOutcome: withdrawal.finalizationOutcome,
            finalizationReference: withdrawal.finalizationReference,
            finalizationTransactionReference: withdrawal.finalizationTransactionId,
            finalizationProjectionReference: withdrawal.finalizationProjectionOperationReference,
            finalizationLedgerEntryCount: entries.length,
            terminalAuditCount: auditCount,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            destinationReference: withdrawal.destinationReference,
            walletReference: provider?.walletReference,
            classification,
            issueCodes: issues,
        };
        return {
            withdrawal, provider, classification, severity, issueCodes: issues,
            recommendedAction, allowedActions, snapshot,
            snapshotFingerprint: (0, creatorWithdrawalOperationalIdentity_util_1.fingerprintWithdrawalOperationalSnapshot)(snapshot),
            reconciliationIdentity: (0, creatorWithdrawalOperationalIdentity_util_1.deriveCreatorWithdrawalReconciliationIdentity)({
                withdrawalReference: withdrawal.withdrawalReference,
                providerRequestReference: provider?.providerRequestReference,
                creatorId: withdrawal.creatorId.toString(),
                creatorUserId: withdrawal.creatorUserId.toString(),
                walletId: withdrawal.walletId.toString(),
                destinationReference: withdrawal.destinationReference,
                amount: withdrawal.amount, currency: withdrawal.currency,
                providerTerminalStatus: withdrawal.providerTerminalStatus,
                finalizationOutcome: withdrawal.finalizationOutcome ??
                    (provider?.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                        ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.COMPLETED
                        : provider?.providerStatus === internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED
                            ? creatorWithdrawalFinalizationOutcome_enum_1.CreatorWithdrawalFinalizationOutcome.FAILED : undefined),
            }),
            expectedFinalizationIdentity: identity,
            finalizationLedgerEntryIds: entryIds,
            finalizationProjectionOperationId: projection?._id,
            missingFinalizationFields: missingFields,
            terminalAuditCount: auditCount,
        };
    }
}
exports.CreatorWithdrawalOperationalInspectionService = CreatorWithdrawalOperationalInspectionService;
exports.creatorWithdrawalOperationalInspectionService = new CreatorWithdrawalOperationalInspectionService();
