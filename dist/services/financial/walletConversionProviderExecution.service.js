"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionProviderExecutionService = exports.WalletConversionProviderExecutionService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const internalProvider_1 = require("../../constants/internalProvider");
const walletConversionProviderExecution_response_dto_1 = require("../../dtos/wallet/walletConversionProviderExecution.response.dto");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionDecision_enum_1 = require("../../enums/financial/walletConversionDecision.enum");
const walletConversionProviderOutcome_enum_1 = require("../../enums/financial/walletConversionProviderOutcome.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionProviderExecutionError_1 = require("../../errors/financial/WalletConversionProviderExecutionError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const internalProviderEvent_repository_1 = __importDefault(require("../../repositories/internalProvider/internalProviderEvent.repository"));
const internalWalletConversionProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWalletConversionProviderRequest.repository");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletConversionProviderIdentity_util_1 = require("../../utils/financial/walletConversionProviderIdentity.util");
const providerEvent_service_1 = __importDefault(require("../internalProvider/events/providerEvent.service"));
const providerSimulator_service_1 = require("../providerSimulator/providerSimulator.service");
const walletConversionRequest_service_1 = require("./walletConversionRequest.service");
const isTransient = (error) => {
    const value = error;
    return value?.code === 112 || value?.code === 251 ||
        value?.hasErrorLabel?.("TransientTransactionError") === true ||
        value?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};
class WalletConversionProviderExecutionService {
    constructor(requestService = walletConversionRequest_service_1.walletConversionRequestService, options = {}) {
        this.requestService = requestService;
        this.options = options;
        this.now = options.now ?? (() => new Date());
        this.executeProvider = options.executor ?? ((input) => providerSimulator_service_1.providerSimulatorService.simulateWalletConversionProvider(input));
    }
    fail(message, code, cause) {
        throw new WalletConversionProviderExecutionError_1.WalletConversionProviderExecutionError(message, code, { cause });
    }
    async inject(stage) {
        await this.options.failureInjector?.(stage);
    }
    normalize(input) {
        if (!mongoose_1.Types.ObjectId.isValid(input.adminUserId)) {
            this.fail("Admin identity is invalid.", "WALLET_CONVERSION_PROVIDER_UNAUTHORIZED");
        }
        if (typeof input.conversionReference !== "string" ||
            !(0, reference_util_1.hasReferenceType)(input.conversionReference, "WALLET_CONVERSION") ||
            !Object.values(walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome).includes(input.outcome)) {
            this.fail("Wallet conversion provider execution input is invalid.", "WALLET_CONVERSION_PROVIDER_INVALID_INPUT");
        }
        const outcome = input.outcome;
        const failureCode = input.failureCode === undefined ? undefined :
            typeof input.failureCode === "string" ? input.failureCode.trim() : "";
        const failureReason = input.failureReason === undefined ? undefined :
            typeof input.failureReason === "string" ? input.failureReason.trim() : "";
        if ((failureCode !== undefined &&
            !/^[A-Z][A-Z0-9_]{0,63}$/.test(failureCode)) ||
            (failureReason !== undefined &&
                (!failureReason || failureReason.length > 500)) ||
            (outcome === walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS &&
                (failureCode !== undefined || failureReason !== undefined))) {
            this.fail("Wallet conversion provider failure input is invalid.", "WALLET_CONVERSION_PROVIDER_INVALID_INPUT");
        }
        return { adminUserId: new mongoose_1.Types.ObjectId(input.adminUserId),
            conversionReference: input.conversionReference.trim(), outcome,
            failureCode, failureReason };
    }
    identity(request) {
        return (0, walletConversionProviderIdentity_util_1.deriveWalletConversionProviderIdentity)({
            conversionReference: request.conversionReference,
            userId: request.userId, sourceWalletId: request.sourceWalletId,
            targetWalletId: request.targetWalletId,
            sourceCurrency: request.sourceCurrency,
            targetCurrency: request.targetCurrency,
            sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
            fxSnapshotReference: request.fxSnapshotReference,
            fxProvider: request.fxProvider, fxEffectiveDate: request.fxEffectiveDate,
        });
    }
    async resolveApproved(conversionReference, session, allowAccountingTerminal = false) {
        const request = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(conversionReference, session);
        if (!request)
            this.fail("Wallet conversion request was not found.", "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
        const allowedStatuses = allowAccountingTerminal
            ? [walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
                walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
                walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED]
            : [walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED];
        if (!allowedStatuses.includes(request.status)) {
            this.fail("Only an approved Wallet conversion request may execute.", "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED");
        }
        try {
            await this.requestService.validateStoredAuthority(request, {
                checkSourceBalance: false, requireSnapshotEligible: false,
            });
        }
        catch (error) {
            this.fail("Approved Wallet conversion identity conflicts.", "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT", error);
        }
        if (!request.decidedAt || !request.decidedBy || request.rejectionCode ||
            request.rejectionReason !== undefined) {
            this.fail("Approved decision authority is incomplete.", "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
        }
        const decisionAudit = await walletConversionAudit_repository_1.walletConversionAuditRepository.findByAuditKey((0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.APPROVED, request.conversionKey), session);
        if (!decisionAudit ||
            decisionAudit.action !== walletConversionAuditAction_enum_1.WalletConversionAuditAction.APPROVED ||
            decisionAudit.decision !== walletConversionDecision_enum_1.WalletConversionDecision.APPROVE ||
            !decisionAudit.adminActorId?.equals(request.decidedBy) ||
            decisionAudit.decidedAt?.getTime() !== request.decidedAt.getTime()) {
            this.fail("Approved decision audit authority conflicts.", "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
        }
        return request;
    }
    ensureIdentity(authority, request, identity) {
        if (authority.providerRequestReference !==
            identity.providerRequestReference ||
            authority.providerRequestKey !== identity.providerRequestKey ||
            authority.conversionReference !== request.conversionReference ||
            !authority.userId.equals(request.userId) ||
            !authority.sourceWalletId.equals(request.sourceWalletId) ||
            String(authority.targetWalletId ?? "") !==
                String(request.targetWalletId ?? "") ||
            authority.sourceCurrency !== request.sourceCurrency ||
            authority.targetCurrency !== request.targetCurrency ||
            authority.sourceAmount !== request.sourceAmount ||
            authority.targetAmount !== request.targetAmount ||
            authority.fxSnapshotReference !== request.fxSnapshotReference ||
            authority.fxProvider !== request.fxProvider ||
            authority.fxEffectiveDate.getTime() !== request.fxEffectiveDate.getTime() ||
            authority.provider !== walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER ||
            authority.providerExecutionReference !==
                identity.providerExecutionReference ||
            authority.providerFingerprint !== identity.providerFingerprint ||
            authority.executionFingerprint !== identity.executionFingerprint) {
            this.fail("Wallet conversion provider identity conflicts.", "WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT");
        }
    }
    metadata(requestReference, executionReference) {
        return {
            provider: walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER,
            environment: process.env.NODE_ENV ?? "development",
            simulationMode: internalProvider_1.ProviderSimulationMode.NORMAL,
            correlationId: requestReference, requestId: executionReference,
        };
    }
    async recordEvent(authority, eventType, operation, transitionKey, occurredAt, session, payloads) {
        await providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.WALLET_CONVERSION_PROVIDER_REQUEST,
            entityId: authority._id,
            eventType, operation, transitionKey,
            providerEntityId: authority.providerRequestReference,
            providerReference: authority.providerExecutionReference,
            providerMetadata: authority.providerMetadata ?? this.metadata(authority.conversionReference, authority.providerExecutionReference),
            execution: authority.execution ?? { attemptNumber: 1, retryCount: 0,
                isTestMode: process.env.NODE_ENV === "test" },
            audit: { createdBy: walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER,
                lastStatusChangedAt: occurredAt },
            payloads: payloads ?? authority.payloads ?? { request: null, response: null },
            occurredAt,
        }, session);
    }
    auditData(request, authority, action, status) {
        return {
            auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(action, request.conversionKey),
            action, conversionReference: request.conversionReference,
            sourceCurrency: request.sourceCurrency,
            targetCurrency: request.targetCurrency,
            sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
            fxSnapshotReference: request.fxSnapshotReference,
            fxEffectiveDate: request.fxEffectiveDate,
            requestedAt: request.requestedAt,
            providerRequestReference: authority.providerRequestReference,
            providerExecutionReference: authority.providerExecutionReference,
            providerStatus: status, providerOutcome: authority.providerOutcome,
            processingAt: authority.processingAt,
            completedAt: authority.completedAt,
            failureCode: authority.failureCode,
        };
    }
    async ensureInitialized(conversionReference) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const session = await mongoose_1.default.startSession();
            try {
                let result = null;
                await session.withTransaction(async () => {
                    const request = await this.resolveApproved(conversionReference, session);
                    const identity = this.identity(request);
                    const existing = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(conversionReference, session);
                    if (existing) {
                        this.ensureIdentity(existing, request, identity);
                        result = existing;
                        return;
                    }
                    const created = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.createInitialized({
                        ...identity, conversionReference: request.conversionReference,
                        userId: request.userId, sourceWalletId: request.sourceWalletId,
                        targetWalletId: request.targetWalletId,
                        sourceCurrency: request.sourceCurrency,
                        targetCurrency: request.targetCurrency,
                        sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
                        fxSnapshotReference: request.fxSnapshotReference,
                        fxProvider: request.fxProvider,
                        fxEffectiveDate: request.fxEffectiveDate,
                        provider: walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER,
                    }, session);
                    const at = this.now();
                    const initPayload = { request: {
                            conversionReference: request.conversionReference,
                            providerRequestReference: created.providerRequestReference,
                        }, response: { providerStatus: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.INITIALIZED } };
                    await this.recordEvent(created, internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_CREATED, internalProvider_1.ProviderOperation.CREATE_CONVERSION_PROVIDER_REQUEST, identity.createdTransitionKey, at, session, initPayload);
                    await this.recordEvent(created, internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_INITIALIZED, internalProvider_1.ProviderOperation.INITIALIZE_CONVERSION_PROVIDER_REQUEST, identity.initializedTransitionKey, at, session, initPayload);
                    result = created;
                });
                if (result)
                    return result;
            }
            catch (error) {
                const winner = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(conversionReference);
                if (winner)
                    return winner;
                if (error?.code !== 11000 && !isTransient(error))
                    throw error;
            }
            finally {
                await session.endSession();
            }
        }
        this.fail("Provider authority initialization conflicted.", "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
    }
    terminalStatus(outcome) {
        return outcome === walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS
            ? internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED
            : internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED;
    }
    async executeTransaction(input) {
        const session = await mongoose_1.default.startSession();
        let executed = false;
        try {
            await session.withTransaction(async () => {
                const request = await this.resolveApproved(input.conversionReference, session);
                const identity = this.identity(request);
                let authority = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(input.conversionReference, session);
                if (!authority)
                    this.fail("Provider authority was not found.", "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
                this.ensureIdentity(authority, request, identity);
                if (authority.isTerminal)
                    return;
                if (authority.providerStatus !==
                    internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.INITIALIZED ||
                    authority.version !== 0) {
                    this.fail("Provider authority is not initialized.", "WALLET_CONVERSION_PROVIDER_STATE_CONFLICT");
                }
                const processingAt = this.now();
                const providerMetadata = this.metadata(request.conversionReference, identity.providerExecutionReference);
                const execution = { attemptNumber: 1, retryCount: 0,
                    isTestMode: process.env.NODE_ENV === "test" };
                const requestPayload = {
                    conversionReference: request.conversionReference,
                    providerRequestReference: identity.providerRequestReference,
                    providerExecutionReference: identity.providerExecutionReference,
                    sourceCurrency: request.sourceCurrency,
                    targetCurrency: request.targetCurrency,
                    sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
                    fxSnapshotReference: request.fxSnapshotReference,
                };
                authority = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.markProcessing({
                    providerRequestReference: authority.providerRequestReference,
                    providerFingerprint: authority.providerFingerprint,
                    executionFingerprint: authority.executionFingerprint,
                    processingAt, providerMetadata, execution, requestPayload,
                    expectedVersion: authority.version,
                }, session) ?? this.fail("PROCESSING transition conflicted.", "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
                await this.inject("AFTER_PROCESSING");
                await this.recordEvent(authority, internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_PROCESSING, internalProvider_1.ProviderOperation.PROCESS_CONVERSION_PROVIDER_REQUEST, identity.processingTransitionKey, processingAt, session);
                await this.inject("AFTER_EVENT_CREATION");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce(this.auditData(request, authority, walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_STARTED, internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.PROCESSING), session);
                let providerResult;
                try {
                    providerResult = this.executeProvider({
                        providerRequestReference: identity.providerRequestReference,
                        providerExecutionReference: identity.providerExecutionReference,
                        conversionReference: request.conversionReference,
                        outcome: input.outcome, failureCode: input.failureCode,
                        failureReason: input.failureReason,
                    });
                }
                catch (error) {
                    this.fail("Internal Provider conversion execution failed.", "WALLET_CONVERSION_PROVIDER_FAILURE", error);
                }
                if (providerResult.status !== this.terminalStatus(input.outcome) ||
                    providerResult.outcome !== input.outcome) {
                    this.fail("Provider terminal result conflicts with execution intent.", "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
                }
                const completedAt = this.now();
                authority = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.markTerminal({
                    providerRequestReference: authority.providerRequestReference,
                    executionFingerprint: authority.executionFingerprint,
                    status: providerResult.status, outcome: providerResult.outcome,
                    completedAt, responseCode: providerResult.responseCode,
                    failureCode: providerResult.failureCode,
                    failureReason: providerResult.failureReason,
                    responsePayload: providerResult.responsePayload,
                    processingLatencyMs: Math.max(0, completedAt.getTime() - processingAt.getTime()),
                    expectedVersion: authority.version,
                }, session) ?? this.fail("Terminal transition conflicted.", "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT");
                await this.inject("AFTER_TERMINAL_STATE");
                const succeeded = authority.providerStatus ===
                    internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED;
                await this.recordEvent(authority, succeeded ? internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_SUCCEEDED :
                    internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_FAILED, succeeded ? internalProvider_1.ProviderOperation.SUCCEED_CONVERSION_PROVIDER_REQUEST :
                    internalProvider_1.ProviderOperation.FAIL_CONVERSION_PROVIDER_REQUEST, succeeded ? identity.succeededTransitionKey :
                    identity.failedTransitionKey, completedAt, session);
                await this.inject("BEFORE_REQUEST_SYNCHRONIZATION");
                const synchronized = await walletConversionRequest_repository_1.walletConversionRequestRepository.synchronizeProviderTerminal({
                    conversionReference: request.conversionReference,
                    providerRequestReference: authority.providerRequestReference,
                    providerExecutionReference: authority.providerExecutionReference,
                    providerStatus: authority.providerStatus,
                    providerOutcome: authority.providerOutcome,
                    providerProcessingAt: processingAt,
                    providerCompletedAt: completedAt,
                    providerFailureCode: authority.failureCode,
                    providerMetadata: { provider: walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER,
                        responseCode: authority.responseCode }, session,
                });
                if (!synchronized)
                    this.fail("Request synchronization conflicted.", "WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce(this.auditData(request, authority, succeeded ? walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_SUCCEEDED :
                    walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_FAILED, authority.providerStatus), session);
                await this.inject("BEFORE_COMMIT");
                executed = true;
            });
            return executed;
        }
        finally {
            await session.endSession();
        }
    }
    async validateReplay(conversionReference, expectedOutcome, options) {
        const allowAccountingTerminal = options?.allowAccountingTerminal === true;
        const request = await this.resolveApproved(conversionReference, undefined, allowAccountingTerminal);
        const identity = this.identity(request);
        const authority = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(conversionReference);
        if (!authority)
            this.fail("Provider authority was not found.", "WALLET_CONVERSION_PROVIDER_REQUEST_NOT_FOUND");
        this.ensureIdentity(authority, request, identity);
        if (expectedOutcome !== undefined && authority.providerStatus !==
            this.terminalStatus(expectedOutcome)) {
            this.fail("Provider terminal result conflicts with execution intent.", "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
        }
        const expectedStatus = expectedOutcome === undefined
            ? authority.providerStatus : this.terminalStatus(expectedOutcome);
        if (!authority.isTerminal || authority.version !== 2 ||
            authority.providerStatus !== expectedStatus ||
            ![internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED,
                internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED]
                .includes(authority.providerStatus) ||
            !authority.providerOutcome || !authority.processingAt ||
            !authority.completedAt || authority.completedAt < authority.processingAt ||
            !authority.providerMetadata || !authority.execution ||
            !authority.payloads || !authority.responseCode ||
            (authority.providerStatus ===
                internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED &&
                (authority.providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS ||
                    authority.failureCode || authority.failureReason)) ||
            (authority.providerStatus ===
                internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED &&
                (authority.providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE ||
                    !authority.failureCode))) {
            this.fail("Provider terminal replay conflicts.", "WALLET_CONVERSION_PROVIDER_REPLAY_CONFLICT");
        }
        if ((!allowAccountingTerminal &&
            request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED) ||
            (allowAccountingTerminal && ![
                walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
                walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
                walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED,
            ].includes(request.status)) ||
            request.providerRequestReference !== authority.providerRequestReference ||
            request.providerExecutionReference !==
                authority.providerExecutionReference ||
            request.providerStatus !== authority.providerStatus ||
            request.providerOutcome !== authority.providerOutcome ||
            request.providerProcessingAt?.getTime() !==
                authority.processingAt.getTime() ||
            request.providerCompletedAt?.getTime() !==
                authority.completedAt.getTime() ||
            request.providerFailureCode !== authority.failureCode ||
            request.providerMetadata?.provider !==
                walletConversionProviderIdentity_util_1.INTERNAL_WALLET_CONVERSION_PROVIDER ||
            request.providerMetadata?.responseCode !== authority.responseCode) {
            this.fail("Provider request synchronization conflicts.", "WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT");
        }
        const terminalEvent = authority.providerStatus ===
            internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED
            ? internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_SUCCEEDED
            : internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_FAILED;
        const terminalOperation = authority.providerStatus ===
            internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED
            ? internalProvider_1.ProviderOperation.SUCCEED_CONVERSION_PROVIDER_REQUEST
            : internalProvider_1.ProviderOperation.FAIL_CONVERSION_PROVIDER_REQUEST;
        const terminalTransition = authority.providerStatus ===
            internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED
            ? identity.succeededTransitionKey : identity.failedTransitionKey;
        const events = await internalProviderEvent_repository_1.default.findMany({
            entityType: internalProvider_1.ProviderEntityType.WALLET_CONVERSION_PROVIDER_REQUEST,
            entityId: authority._id,
        });
        const requiredEvents = [
            [internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_CREATED,
                internalProvider_1.ProviderOperation.CREATE_CONVERSION_PROVIDER_REQUEST,
                identity.createdTransitionKey],
            [internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_INITIALIZED,
                internalProvider_1.ProviderOperation.INITIALIZE_CONVERSION_PROVIDER_REQUEST,
                identity.initializedTransitionKey],
            [internalProvider_1.ProviderEventType.CONVERSION_PROVIDER_PROCESSING,
                internalProvider_1.ProviderOperation.PROCESS_CONVERSION_PROVIDER_REQUEST,
                identity.processingTransitionKey],
            [terminalEvent, terminalOperation, terminalTransition],
        ];
        if (events.length !== 4 || !requiredEvents.every(([event, operation, key]) => events.some((candidate) => candidate.eventType === event &&
            candidate.operation === operation && candidate.transitionKey === key &&
            candidate.providerEntityId === authority.providerRequestReference &&
            candidate.providerReference ===
                authority.providerExecutionReference))) {
            this.fail("Provider event chain conflicts.", "WALLET_CONVERSION_PROVIDER_EVENT_CONFLICT");
        }
        const terminalAction = authority.providerStatus ===
            internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED
            ? walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_SUCCEEDED
            : walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_FAILED;
        const audits = await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference, action: { $in: [
                    walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_STARTED, terminalAction,
                ] },
        });
        if (audits.length !== 2 || !audits.some((audit) => audit.action === walletConversionAuditAction_enum_1.WalletConversionAuditAction.PROVIDER_STARTED &&
            audit.providerStatus ===
                internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.PROCESSING &&
            audit.processingAt?.getTime() === authority.processingAt.getTime()) ||
            !audits.some((audit) => audit.action === terminalAction &&
                audit.providerStatus === authority.providerStatus &&
                audit.providerOutcome === authority.providerOutcome &&
                audit.completedAt?.getTime() === authority.completedAt.getTime() &&
                audit.providerRequestReference === authority.providerRequestReference &&
                audit.providerExecutionReference ===
                    authority.providerExecutionReference &&
                audit.failureCode === authority.failureCode)) {
            this.fail("Provider audit chain conflicts.", "WALLET_CONVERSION_PROVIDER_AUDIT_CONFLICT");
        }
        return (0, walletConversionProviderExecution_response_dto_1.toWalletConversionProviderExecutionResponseDto)(authority);
    }
    async execute(raw) {
        const input = this.normalize(raw);
        const existing = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(input.conversionReference);
        if (existing?.isTerminal) {
            return this.validateReplay(input.conversionReference, input.outcome);
        }
        const authority = await this.ensureInitialized(input.conversionReference);
        const request = await this.resolveApproved(input.conversionReference);
        this.ensureIdentity(authority, request, this.identity(request));
        await this.inject("AFTER_AUTHORITY");
        if (authority.isTerminal) {
            return this.validateReplay(input.conversionReference, input.outcome);
        }
        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                await this.executeTransaction(input);
                return this.validateReplay(input.conversionReference, input.outcome);
            }
            catch (error) {
                lastError = error;
                const winner = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(input.conversionReference);
                if (winner?.isTerminal) {
                    return this.validateReplay(input.conversionReference, input.outcome);
                }
                if (error instanceof WalletConversionProviderExecutionError_1.WalletConversionProviderExecutionError &&
                    error.code !== "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT") {
                    throw error;
                }
                if (!isTransient(error))
                    break;
            }
        }
        if (lastError instanceof WalletConversionProviderExecutionError_1.WalletConversionProviderExecutionError) {
            throw lastError;
        }
        this.fail("Provider execution transaction failed.", "WALLET_CONVERSION_PROVIDER_TRANSACTION_CONFLICT", lastError);
    }
}
exports.WalletConversionProviderExecutionService = WalletConversionProviderExecutionService;
exports.walletConversionProviderExecutionService = new WalletConversionProviderExecutionService();
