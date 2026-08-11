"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalProviderExecutionService = exports.WithdrawalProviderExecutionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalProvider_1 = require("../../constants/internalProvider");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const WithdrawalProviderExecutionError_1 = require("../../errors/financial/WithdrawalProviderExecutionError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const internalProviderEvent_repository_1 = __importDefault(require("../../repositories/internalProvider/internalProviderEvent.repository"));
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const internalWithdrawalProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWithdrawalProviderRequest.repository");
const payoutDestination_repository_1 = require("../../repositories/payoutDestination.repository");
const withdrawalProviderIdentity_util_1 = require("../../utils/financial/withdrawalProviderIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const providerClock_service_1 = __importDefault(require("../internalProvider/base/providerClock.service"));
const providerEvent_service_1 = __importDefault(require("../internalProvider/events/providerEvent.service"));
const providerSimulator_service_1 = require("../providerSimulator/providerSimulator.service");
const creatorWithdrawalRequest_service_1 = require("./creatorWithdrawalRequest.service");
const withdrawalProviderInitialization_service_1 = require("./withdrawalProviderInitialization.service");
const isTransientTransactionError = (error) => {
    const candidate = error;
    return candidate?.code === 112 ||
        candidate?.code === 251 ||
        candidate?.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};
class WithdrawalProviderExecutionService {
    constructor(onStage = () => undefined, executeProvider = (input) => providerSimulator_service_1.providerSimulatorService.simulateWithdrawalProvider(input)) {
        this.onStage = onStage;
        this.executeProvider = executeProvider;
    }
    fail(message, code, cause) {
        throw new WithdrawalProviderExecutionError_1.WithdrawalProviderExecutionError(message, code, { cause });
    }
    terminalStatus(outcome) {
        return outcome === withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS
            ? internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            : internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED;
    }
    validateInput(input) {
        if (typeof input.withdrawalReference !== "string" ||
            !input.withdrawalReference.trim() ||
            !Object.values(withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome)
                .includes(input.outcome) ||
            (input.failureCode !== undefined &&
                !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.failureCode)) ||
            (input.failureReason !== undefined &&
                (typeof input.failureReason !== "string" ||
                    !input.failureReason.trim() ||
                    input.failureReason.trim().length > 500)) ||
            (input.outcome === withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS &&
                (input.failureCode !== undefined || input.failureReason !== undefined))) {
            this.fail("Invalid withdrawal provider execution request.", "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT");
        }
    }
    ensureIdentity(withdrawal, providerRequest) {
        const providerIdentity = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderIdentity)({
            withdrawalReference: withdrawal.withdrawalReference,
            creatorId: withdrawal.creatorId,
            creatorReference: providerRequest.creatorReference,
            walletId: withdrawal.walletId,
            destinationReference: withdrawal.destinationReference,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
        });
        if (withdrawal.providerRequestReference !==
            providerRequest.providerRequestReference ||
            providerRequest.providerRequestReference !==
                providerIdentity.providerRequestReference ||
            providerRequest.providerRequestKey !==
                providerIdentity.providerRequestKey ||
            providerRequest.providerReference !== providerIdentity.providerReference ||
            providerRequest.providerFingerprint !==
                providerIdentity.providerFingerprint ||
            providerRequest.walletReference !== providerIdentity.walletReference ||
            providerRequest.destinationReference !==
                withdrawal.destinationReference ||
            providerRequest.currency !== withdrawal.currency ||
            providerRequest.amount !== withdrawal.amount) {
            this.fail("Withdrawal provider identity conflicts before execution.", "WITHDRAWAL_PROVIDER_EXECUTION_CONFLICT");
        }
        return (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderExecutionIdentity)({
            providerRequestReference: providerRequest.providerRequestReference,
            providerRequestKey: providerRequest.providerRequestKey,
            providerReference: providerRequest.providerReference,
            providerFingerprint: providerRequest.providerFingerprint,
        });
    }
    async resolveContext(withdrawalReference, session, allowFinalized = false) {
        const withdrawal = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference, session);
        const reservationAuthorityPresent = withdrawal && ((withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            withdrawal.reservedAmount === withdrawal.amount) ||
            (allowFinalized &&
                [
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
                ].includes(withdrawal.status) &&
                withdrawal.reservedAmount === 0 &&
                Boolean(withdrawal.finalizationReference)));
        if (!withdrawal || !reservationAuthorityPresent ||
            !withdrawal.providerRequestReference) {
            this.fail("Reserved withdrawal authority is unavailable for execution.", "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT");
        }
        const providerRequest = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(withdrawalReference, session);
        if (!providerRequest) {
            this.fail("Withdrawal provider request was not found.", "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING");
        }
        const [creator, destination] = await Promise.all([
            creatorProfile_model_1.CreatorProfile.findById(withdrawal.creatorId).session(session ?? null),
            payoutDestination_repository_1.payoutDestinationRepository.findByCreatorAndReference(withdrawal.creatorUserId.toString(), withdrawal.destinationReference, session),
        ]);
        if (!creator || creator.status !== "active") {
            this.fail("Creator is not active for provider execution.", "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT");
        }
        if (!destination ||
            !destination._id.equals(withdrawal.destinationId) ||
            destination.verificationStatus !==
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
            !destination.isActive ||
            !destination.verifiedAt) {
            this.fail("Withdrawal destination is not healthy for provider execution.", "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT");
        }
        return {
            withdrawal,
            providerRequest,
            executionIdentity: this.ensureIdentity(withdrawal, providerRequest),
        };
    }
    safe(providerRequest, replay) {
        return {
            providerRequestReference: providerRequest.providerRequestReference,
            withdrawalReference: providerRequest.withdrawalReference,
            providerReference: providerRequest.providerReference,
            executionReference: providerRequest.executionReference,
            providerStatus: providerRequest.providerStatus,
            processingAt: providerRequest.processingAt,
            succeededAt: providerRequest.succeededAt,
            failedAt: providerRequest.failedAt,
            responseCode: providerRequest.terminalResult?.code,
            failureReason: providerRequest.providerStatus ===
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED
                ? providerRequest.terminalResult?.message
                : undefined,
            replay,
        };
    }
    async recordEvent(providerRequest, eventType, operation, transitionKey, occurredAt, session) {
        if (!providerRequest.providerMetadata ||
            !providerRequest.execution ||
            !providerRequest.payloads) {
            this.fail("Provider execution metadata is incomplete.", "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT");
        }
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
            entityId: providerRequest._id,
            eventType,
            operation,
            transitionKey,
            providerEntityId: providerRequest.providerRequestReference,
            providerReference: providerRequest.providerReference,
            providerMetadata: providerRequest.providerMetadata,
            execution: providerRequest.execution,
            audit: {
                createdBy: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                lastStatusChangedAt: occurredAt,
            },
            payloads: providerRequest.payloads,
            occurredAt,
        }, session);
    }
    async recordAudit(providerRequest, action, fromStatus, toStatus, outcome, session) {
        await (0, auditLog_service_1.createFinancialAudit)({
            action,
            actor: { type: "PROVIDER", reference: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER },
            entityType: "INTERNAL_WITHDRAWAL_PROVIDER_REQUEST",
            entityId: providerRequest._id,
            financialContext: {
                domain: "WITHDRAWAL",
                primaryReference: providerRequest.withdrawalReference,
                withdrawalReference: providerRequest.withdrawalReference,
                provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                providerReference: providerRequest.providerReference,
                amount: providerRequest.amount,
                currency: providerRequest.currency,
            },
            transition: { fromStatus, toStatus, outcome },
            metadata: {
                creatorReference: providerRequest.creatorReference,
                walletReference: providerRequest.walletReference,
                destinationReference: providerRequest.destinationReference,
                providerStatus: toStatus,
                reasonCode: action,
                ...(providerRequest.providerStatus ===
                    internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED
                    ? { failureCode: providerRequest.terminalResult?.code ??
                            "INTERNAL_PROVIDER_FAILED" }
                    : {}),
            },
            session,
        });
    }
    async validateReplay(withdrawalReference, expectedOutcome) {
        await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.validateReplay(withdrawalReference);
        await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.validateReplay(withdrawalReference);
        const context = await this.resolveContext(withdrawalReference, undefined, true);
        const { withdrawal, providerRequest, executionIdentity } = context;
        const terminalStatuses = [
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
        ];
        if (!terminalStatuses.includes(providerRequest.providerStatus) ||
            !providerRequest.isTerminal ||
            providerRequest.version !== 3 ||
            !providerRequest.processingAt ||
            !providerRequest.executionReference ||
            providerRequest.executionReference !==
                executionIdentity.executionReference ||
            providerRequest.executionFingerprint !==
                executionIdentity.executionFingerprint ||
            !providerRequest.providerMetadata ||
            providerRequest.providerMetadata.provider !==
                withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER ||
            !providerRequest.execution ||
            !providerRequest.payloads ||
            !providerRequest.terminalResult ||
            providerRequest.terminalResult.outcome !== providerRequest.providerStatus) {
            this.fail("Withdrawal provider terminal replay conflicts.", "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT");
        }
        const expectedStatus = expectedOutcome === undefined
            ? providerRequest.providerStatus
            : this.terminalStatus(expectedOutcome);
        if (providerRequest.providerStatus !== expectedStatus ||
            (providerRequest.providerStatus ===
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED &&
                (!providerRequest.succeededAt || providerRequest.failedAt)) ||
            (providerRequest.providerStatus ===
                internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED &&
                (!providerRequest.failedAt || providerRequest.succeededAt))) {
            this.fail("Provider terminal result does not match the requested outcome.", "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH");
        }
        const terminalAt = providerRequest.succeededAt ?? providerRequest.failedAt;
        const withdrawalLifecycleMatches = (withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            withdrawal.reservedAmount === withdrawal.amount) ||
            ([
                creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
                creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
            ].includes(withdrawal.status) &&
                withdrawal.reservedAmount === 0 &&
                String(withdrawal.finalizationOutcome) === withdrawal.status &&
                Boolean(withdrawal.finalizationReference));
        if (!withdrawalLifecycleMatches ||
            withdrawal.providerTerminalStatus !== providerRequest.providerStatus ||
            withdrawal.providerProcessingAt?.getTime() !==
                providerRequest.processingAt.getTime() ||
            withdrawal.providerSucceededAt?.getTime() !==
                providerRequest.succeededAt?.getTime() ||
            withdrawal.providerFailedAt?.getTime() !==
                providerRequest.failedAt?.getTime() ||
            withdrawal.providerExecutionMetadata?.provider !==
                withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER ||
            withdrawal.providerExecutionMetadata.executionReference !==
                executionIdentity.executionReference ||
            withdrawal.providerExecutionMetadata.responseCode !==
                providerRequest.terminalResult.code ||
            terminalAt.getTime() < providerRequest.processingAt.getTime()) {
            this.fail("Withdrawal provider terminal synchronization conflicts.", "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT");
        }
        const [events, audits] = await Promise.all([
            internalProviderEvent_repository_1.default.findMany({
                entityType: internalProvider_1.ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
                entityId: providerRequest._id,
                eventType: {
                    $in: [
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING,
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED,
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_FAILED,
                    ],
                },
            }),
            auditLog_model_1.AuditLog.find({
                entityId: providerRequest._id,
                action: {
                    $in: [
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED,
                    ],
                },
            }),
        ]);
        const terminalEvent = providerRequest.providerStatus ===
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED
            : internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_FAILED;
        const terminalTransitionKey = providerRequest.providerStatus ===
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? executionIdentity.succeededTransitionKey
            : executionIdentity.failedTransitionKey;
        if (events.length !== 2 ||
            !events.some((event) => event.eventType ===
                internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING &&
                event.operation ===
                    internalProvider_1.ProviderOperation.PROCESS_WITHDRAWAL_PROVIDER_REQUEST &&
                event.transitionKey === executionIdentity.processingTransitionKey) ||
            !events.some((event) => event.eventType === terminalEvent &&
                event.operation === (providerRequest.providerStatus ===
                    internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
                    ? internalProvider_1.ProviderOperation.SUCCEED_WITHDRAWAL_PROVIDER_REQUEST
                    : internalProvider_1.ProviderOperation.FAIL_WITHDRAWAL_PROVIDER_REQUEST) &&
                event.transitionKey === terminalTransitionKey) ||
            !events.every((event) => event.providerEntityId === providerRequest.providerRequestReference &&
                event.providerReference === providerRequest.providerReference)) {
            this.fail("Withdrawal provider execution event chain conflicts.", "WITHDRAWAL_PROVIDER_EXECUTION_EVENT_CONFLICT");
        }
        const terminalAuditAction = providerRequest.providerStatus ===
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED
            ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED
            : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED;
        if (audits.length !== 2 ||
            !audits.some((audit) => audit.action ===
                auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING) ||
            !audits.some((audit) => audit.action === terminalAuditAction) ||
            !audits.every((audit) => audit.financialContext?.withdrawalReference ===
                withdrawalReference &&
                audit.financialContext?.providerReference ===
                    providerRequest.providerReference &&
                audit.financialContext?.amount === providerRequest.amount &&
                audit.financialContext?.currency === providerRequest.currency &&
                audit.metadata?.creatorReference ===
                    providerRequest.creatorReference &&
                audit.metadata?.walletReference === providerRequest.walletReference &&
                audit.metadata?.destinationReference ===
                    providerRequest.destinationReference)) {
            this.fail("Withdrawal provider execution audit chain conflicts.", "WITHDRAWAL_PROVIDER_EXECUTION_REPLAY_CONFLICT");
        }
        return this.safe(providerRequest, true);
    }
    async executeTransaction(input) {
        const session = await mongoose_1.default.startSession();
        let committed = false;
        try {
            await session.withTransaction(async () => {
                const context = await this.resolveContext(input.withdrawalReference, session);
                const { withdrawal, executionIdentity } = context;
                let providerRequest = context.providerRequest;
                const expectedStatus = this.terminalStatus(input.outcome);
                if (providerRequest.isTerminal) {
                    if (providerRequest.providerStatus !== expectedStatus) {
                        this.fail("Provider terminal result conflicts with execution intent.", "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH");
                    }
                    committed = true;
                    return;
                }
                if (providerRequest.providerStatus !==
                    internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED) {
                    this.fail("Provider request is not initialized for execution.", "WITHDRAWAL_PROVIDER_EXECUTION_STATE_CONFLICT");
                }
                await this.onStage("BEFORE_PROCESSING");
                const processingAt = providerClock_service_1.default.now();
                const providerMetadata = {
                    provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                    environment: process.env.NODE_ENV ?? "development",
                    simulationMode: internalProvider_1.ProviderSimulationMode.NORMAL,
                    correlationId: providerRequest.withdrawalReference,
                    requestId: executionIdentity.executionReference,
                };
                const execution = {
                    attemptNumber: 1,
                    retryCount: 0,
                    isTestMode: process.env.NODE_ENV === "test",
                };
                providerRequest =
                    await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.markProcessing({
                        providerRequestReference: providerRequest.providerRequestReference,
                        providerFingerprint: providerRequest.providerFingerprint,
                        executionReference: executionIdentity.executionReference,
                        executionFingerprint: executionIdentity.executionFingerprint,
                        processingAt,
                        providerMetadata,
                        execution,
                        requestPayload: {
                            withdrawalReference: providerRequest.withdrawalReference,
                            providerRequestReference: providerRequest.providerRequestReference,
                            providerReference: providerRequest.providerReference,
                            executionReference: executionIdentity.executionReference,
                            destinationReference: providerRequest.destinationReference,
                            amount: providerRequest.amount,
                            currency: providerRequest.currency,
                        },
                        expectedVersion: providerRequest.version,
                    }, session) ?? this.fail("Provider PROCESSING transition conflicted.", "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT");
                await this.recordEvent(providerRequest, internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_WITHDRAWAL_PROVIDER_REQUEST, executionIdentity.processingTransitionKey, processingAt, session);
                await this.recordAudit(providerRequest, auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_PROCESSING, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING, "PROCESSING", session);
                await this.onStage("AFTER_PROCESSING");
                await this.onStage("BEFORE_TERMINAL_STATE");
                let providerResult;
                try {
                    providerResult = this.executeProvider({
                        providerRequestReference: providerRequest.providerRequestReference,
                        providerReference: providerRequest.providerReference,
                        executionReference: executionIdentity.executionReference,
                        outcome: input.outcome,
                        failureCode: input.failureCode,
                        failureReason: input.failureReason,
                    });
                }
                catch (error) {
                    this.fail("Internal Provider withdrawal execution failed.", "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_FAILURE", error);
                }
                if (providerResult.status !== expectedStatus) {
                    this.fail("Internal Provider returned an unexpected terminal result.", "WITHDRAWAL_PROVIDER_EXECUTION_TERMINAL_MISMATCH");
                }
                const terminalAt = providerClock_service_1.default.now();
                providerRequest =
                    await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.markTerminal({
                        providerRequestReference: providerRequest.providerRequestReference,
                        executionFingerprint: executionIdentity.executionFingerprint,
                        status: providerResult.status,
                        terminalAt,
                        responseCode: providerResult.responseCode,
                        responseMessage: providerResult.responseMessage,
                        responsePayload: providerResult.responsePayload,
                        processingLatencyMs: Math.max(0, terminalAt.getTime() - processingAt.getTime()),
                        expectedVersion: providerRequest.version,
                    }, session) ?? this.fail("Provider terminal transition conflicted.", "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT");
                await this.onStage("AFTER_TERMINAL_STATE");
                const succeeded = providerRequest.providerStatus ===
                    internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED;
                await this.recordEvent(providerRequest, succeeded
                    ? internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_SUCCEEDED
                    : internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_FAILED, succeeded
                    ? internalProvider_1.ProviderOperation.SUCCEED_WITHDRAWAL_PROVIDER_REQUEST
                    : internalProvider_1.ProviderOperation.FAIL_WITHDRAWAL_PROVIDER_REQUEST, succeeded
                    ? executionIdentity.succeededTransitionKey
                    : executionIdentity.failedTransitionKey, terminalAt, session);
                await this.onStage("BEFORE_AUDIT");
                await this.recordAudit(providerRequest, succeeded
                    ? auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_SUCCEEDED
                    : auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_FAILED, internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING, providerRequest.providerStatus, succeeded ? "SUCCEEDED" : "FAILED", session);
                const synchronized = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.synchronizeProviderTerminal({
                    requestId: withdrawal._id,
                    withdrawalReference: withdrawal.withdrawalReference,
                    providerRequestReference: providerRequest.providerRequestReference,
                    providerTerminalStatus: providerRequest.providerStatus,
                    providerProcessingAt: processingAt,
                    providerSucceededAt: providerRequest.succeededAt,
                    providerFailedAt: providerRequest.failedAt,
                    providerExecutionMetadata: {
                        provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                        providerRequestReference: providerRequest.providerRequestReference,
                        providerReference: providerRequest.providerReference,
                        executionReference: executionIdentity.executionReference,
                        responseCode: providerResult.responseCode,
                        ...(succeeded
                            ? {}
                            : { failureCode: providerResult.responseCode }),
                    },
                    expectedVersion: withdrawal.version,
                }, session);
                if (!synchronized) {
                    this.fail("Withdrawal terminal synchronization conflicted.", "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT");
                }
                await this.onStage("BEFORE_COMMIT");
                committed = true;
            });
            return committed;
        }
        finally {
            await session.endSession();
        }
    }
    async execute(input) {
        this.validateInput(input);
        const normalized = {
            ...input,
            withdrawalReference: input.withdrawalReference.trim(),
            failureCode: input.failureCode?.trim(),
            failureReason: input.failureReason?.trim(),
        };
        await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.validateReplay(normalized.withdrawalReference);
        const existing = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(normalized.withdrawalReference);
        if (!existing) {
            this.fail("Withdrawal provider request was not found.", "WITHDRAWAL_PROVIDER_EXECUTION_PROVIDER_MISSING");
        }
        await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.validateReplay(normalized.withdrawalReference);
        if (existing.isTerminal) {
            return this.validateReplay(normalized.withdrawalReference, normalized.outcome);
        }
        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const committed = await this.executeTransaction(normalized);
                if (!committed) {
                    this.fail("Provider execution did not commit.", "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT");
                }
                const validated = await this.validateReplay(normalized.withdrawalReference, normalized.outcome);
                return { ...validated, replay: false };
            }
            catch (error) {
                lastError = error;
                const winner = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(normalized.withdrawalReference);
                if (winner?.isTerminal) {
                    return this.validateReplay(normalized.withdrawalReference, normalized.outcome);
                }
                if (error instanceof WithdrawalProviderExecutionError_1.WithdrawalProviderExecutionError &&
                    error.code !==
                        "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT") {
                    throw error;
                }
                if (!isTransientTransactionError(error))
                    break;
            }
        }
        if (lastError instanceof WithdrawalProviderExecutionError_1.WithdrawalProviderExecutionError) {
            throw lastError;
        }
        this.fail("Withdrawal provider execution transaction failed.", "WITHDRAWAL_PROVIDER_EXECUTION_TRANSACTION_CONFLICT", lastError);
    }
}
exports.WithdrawalProviderExecutionService = WithdrawalProviderExecutionService;
exports.withdrawalProviderExecutionService = new WithdrawalProviderExecutionService();
