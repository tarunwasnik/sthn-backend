"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalProviderInitializationService = exports.WithdrawalProviderInitializationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const internalProvider_1 = require("../../constants/internalProvider");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
const creatorWithdrawalRequestStatus_enum_1 = require("../../enums/financial/creatorWithdrawalRequestStatus.enum");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const WithdrawalProviderInitializationError_1 = require("../../errors/financial/WithdrawalProviderInitializationError");
const auditLog_model_1 = require("../../models/auditLog.model");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const internalProviderEvent_repository_1 = __importDefault(require("../../repositories/internalProvider/internalProviderEvent.repository"));
const creatorWithdrawalRequest_repository_1 = require("../../repositories/creatorWithdrawalRequest.repository");
const internalWithdrawalProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWithdrawalProviderRequest.repository");
const payoutDestination_repository_1 = require("../../repositories/payoutDestination.repository");
const withdrawalProviderIdentity_util_1 = require("../../utils/financial/withdrawalProviderIdentity.util");
const auditLog_service_1 = require("../auditLog.service");
const providerEvent_service_1 = __importDefault(require("../internalProvider/events/providerEvent.service"));
const creatorWithdrawalRequest_service_1 = require("./creatorWithdrawalRequest.service");
const isTransientTransactionError = (error) => {
    const candidate = error;
    return candidate?.code === 112 ||
        candidate?.code === 251 ||
        candidate?.hasErrorLabel?.("TransientTransactionError") === true ||
        candidate?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
};
class WithdrawalProviderInitializationService {
    constructor(onStage = () => undefined) {
        this.onStage = onStage;
    }
    fail(message, code, cause) {
        throw new WithdrawalProviderInitializationError_1.WithdrawalProviderInitializationError(message, code, { cause });
    }
    ensureIdentity(providerRequest, context) {
        const { withdrawal, creatorReference, identity } = context;
        if (providerRequest.providerRequestReference !==
            identity.providerRequestReference ||
            providerRequest.providerRequestKey !== identity.providerRequestKey ||
            providerRequest.withdrawalReference !==
                withdrawal.withdrawalReference ||
            providerRequest.creatorReference !== creatorReference ||
            providerRequest.walletReference !== identity.walletReference ||
            providerRequest.destinationReference !==
                withdrawal.destinationReference ||
            providerRequest.currency !== withdrawal.currency ||
            providerRequest.amount !== withdrawal.amount ||
            providerRequest.providerFingerprint !== identity.providerFingerprint ||
            providerRequest.providerReference !== identity.providerReference) {
            this.fail("Withdrawal provider identity conflicts with immutable authority.", "WITHDRAWAL_PROVIDER_IDENTITY_CONFLICT");
        }
    }
    async resolveContext(withdrawalReference, session, allowFinalized = false) {
        const withdrawal = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.findByReference(withdrawalReference, session);
        if (!withdrawal) {
            this.fail("Creator withdrawal request was not found.", "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING");
        }
        const reservationAuthorityPresent = (withdrawal.status === creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.RESERVED &&
            withdrawal.reservedAmount === withdrawal.amount) ||
            (allowFinalized &&
                [
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.COMPLETED,
                    creatorWithdrawalRequestStatus_enum_1.CreatorWithdrawalRequestStatus.FAILED,
                ].includes(withdrawal.status) &&
                withdrawal.reservedAmount === 0 &&
                Boolean(withdrawal.finalizationReference));
        if (!reservationAuthorityPresent ||
            !withdrawal.reservedAt ||
            !withdrawal.ledgerTransactionReference ||
            withdrawal.ledgerEntryIds.length !== 2 ||
            !withdrawal.projectionReference) {
            this.fail("Creator withdrawal reservation authority is missing.", "WITHDRAWAL_PROVIDER_RESERVATION_MISSING");
        }
        const [creator, destination] = await Promise.all([
            creatorProfile_model_1.CreatorProfile.findById(withdrawal.creatorId).session(session ?? null),
            payoutDestination_repository_1.payoutDestinationRepository.findByCreatorAndReference(withdrawal.creatorUserId.toString(), withdrawal.destinationReference, session),
        ]);
        if (!creator || creator.status !== "active") {
            this.fail("Active Creator authority is required for provider initialization.", "WITHDRAWAL_PROVIDER_RESERVATION_MISSING");
        }
        if (!destination ||
            !destination._id.equals(withdrawal.destinationId) ||
            destination.verificationStatus !==
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
            !destination.isActive ||
            !destination.verifiedAt) {
            this.fail("Verified payout destination was not found.", "WITHDRAWAL_PROVIDER_DESTINATION_MISSING");
        }
        const identity = (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderIdentity)({
            withdrawalReference: withdrawal.withdrawalReference,
            creatorId: withdrawal.creatorId,
            creatorReference: (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderCreatorReference)(withdrawal.creatorId),
            walletId: withdrawal.walletId,
            destinationReference: withdrawal.destinationReference,
            currency: withdrawal.currency,
            amount: withdrawal.amount,
        });
        return {
            withdrawal,
            creatorReference: (0, withdrawalProviderIdentity_util_1.deriveWithdrawalProviderCreatorReference)(withdrawal.creatorId),
            identity,
        };
    }
    safe(providerRequest, replay) {
        return {
            providerRequestReference: providerRequest.providerRequestReference,
            withdrawalReference: providerRequest.withdrawalReference,
            creatorReference: providerRequest.creatorReference,
            walletReference: providerRequest.walletReference,
            destinationReference: providerRequest.destinationReference,
            currency: providerRequest.currency,
            amount: providerRequest.amount,
            providerStatus: providerRequest.providerStatus,
            providerReference: providerRequest.providerReference,
            replay,
        };
    }
    async recordEvent(providerRequest, identity, eventType, operation, transitionKey, session) {
        return providerEvent_service_1.default.recordEvent({
            entityType: internalProvider_1.ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
            entityId: providerRequest._id,
            eventType,
            operation,
            transitionKey,
            providerEntityId: providerRequest.providerRequestReference,
            providerReference: identity.providerReference,
            providerMetadata: {
                provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                environment: process.env.NODE_ENV ?? "development",
                simulationMode: internalProvider_1.ProviderSimulationMode.NORMAL,
                correlationId: providerRequest.withdrawalReference,
                requestId: providerRequest.providerRequestReference,
            },
            execution: {
                attemptNumber: 1,
                retryCount: 0,
                isTestMode: process.env.NODE_ENV === "test",
            },
            audit: {
                createdBy: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                lastStatusChangedAt: new Date(),
            },
            payloads: {
                request: {
                    withdrawalReference: providerRequest.withdrawalReference,
                    providerRequestReference: providerRequest.providerRequestReference,
                },
                response: {
                    providerStatus: eventType ===
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED
                        ? internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.CREATED
                        : internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
                },
            },
        }, session);
    }
    async validateReplay(withdrawalReference) {
        await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.validateReplay(withdrawalReference);
        const context = await this.resolveContext(withdrawalReference, undefined, true);
        const providerRequest = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(withdrawalReference);
        if (!providerRequest) {
            this.fail("Withdrawal provider initialization was not found.", "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT");
        }
        this.ensureIdentity(providerRequest, context);
        if (![
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.PROCESSING,
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
            internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
        ].includes(providerRequest.providerStatus) ||
            providerRequest.version < 1 ||
            context.withdrawal.providerRequestReference !==
                providerRequest.providerRequestReference) {
            this.fail("Withdrawal provider initialization replay conflicts.", "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT");
        }
        const [events, audits] = await Promise.all([
            internalProviderEvent_repository_1.default.findMany({
                entityType: internalProvider_1.ProviderEntityType.WITHDRAWAL_PROVIDER_REQUEST,
                entityId: providerRequest._id,
                eventType: {
                    $in: [
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
                        internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
                    ],
                },
            }),
            auditLog_model_1.AuditLog.find({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                entityId: providerRequest._id,
                "financialContext.withdrawalReference": withdrawalReference,
            }),
        ]);
        const expectedEvents = [
            {
                eventType: internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED,
                operation: internalProvider_1.ProviderOperation.CREATE_WITHDRAWAL_PROVIDER_REQUEST,
                transitionKey: context.identity.createdTransitionKey,
            },
            {
                eventType: internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED,
                operation: internalProvider_1.ProviderOperation.INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST,
                transitionKey: context.identity.initializedTransitionKey,
            },
        ];
        if (events.length !== 2 ||
            !expectedEvents.every((expected) => events.some((event) => event.eventType === expected.eventType &&
                event.operation === expected.operation &&
                event.transitionKey === expected.transitionKey &&
                event.providerEntityId === providerRequest.providerRequestReference &&
                event.providerReference === context.identity.providerReference &&
                event.providerMetadata.provider === withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER))) {
            this.fail("Withdrawal provider event chain conflicts.", "WITHDRAWAL_PROVIDER_EVENT_CONFLICT");
        }
        const audit = audits[0];
        if (audits.length !== 1 ||
            audit.financialContext?.provider !== withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER ||
            audit.financialContext?.providerReference !==
                context.identity.providerReference ||
            audit.financialContext?.amount !== context.withdrawal.amount ||
            audit.financialContext?.currency !== context.withdrawal.currency ||
            audit.metadata?.destinationReference !==
                context.withdrawal.destinationReference ||
            audit.metadata?.creatorReference !== context.creatorReference) {
            this.fail("Withdrawal provider audit replay conflicts.", "WITHDRAWAL_PROVIDER_REPLAY_CONFLICT");
        }
        return this.safe(providerRequest, true);
    }
    async initializeTransaction(withdrawalReference) {
        const session = await mongoose_1.default.startSession();
        let committedReference;
        try {
            await session.withTransaction(async () => {
                const context = await this.resolveContext(withdrawalReference, session);
                const { withdrawal, identity } = context;
                if (withdrawal.providerRequestReference &&
                    withdrawal.providerRequestReference !==
                        identity.providerRequestReference) {
                    this.fail("Withdrawal is linked to a conflicting provider request.", "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT");
                }
                let providerRequest = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(withdrawalReference, session);
                if (providerRequest) {
                    this.ensureIdentity(providerRequest, context);
                    if (providerRequest.providerStatus ===
                        internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED &&
                        withdrawal.providerRequestReference ===
                            providerRequest.providerRequestReference) {
                        committedReference = providerRequest.providerRequestReference;
                        return;
                    }
                    this.fail("Existing provider authority is not a complete initialization.", "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT");
                }
                const keyConflict = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByKey(identity.providerRequestKey, session);
                if (keyConflict) {
                    this.fail("Provider request key already belongs to another authority.", "WITHDRAWAL_PROVIDER_PROVIDER_CONFLICT");
                }
                providerRequest =
                    await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.create({
                        providerRequestReference: identity.providerRequestReference,
                        providerRequestKey: identity.providerRequestKey,
                        withdrawalReference: withdrawal.withdrawalReference,
                        creatorReference: context.creatorReference,
                        walletReference: identity.walletReference,
                        destinationReference: withdrawal.destinationReference,
                        currency: withdrawal.currency,
                        amount: withdrawal.amount,
                        providerReference: identity.providerReference,
                        providerFingerprint: identity.providerFingerprint,
                    }, session);
                await this.onStage("AFTER_PROVIDER_AUTHORITY");
                await this.recordEvent(providerRequest, identity, internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_CREATED, internalProvider_1.ProviderOperation.CREATE_WITHDRAWAL_PROVIDER_REQUEST, identity.createdTransitionKey, session);
                await this.onStage("AFTER_PROVIDER_EVENT");
                await this.onStage("BEFORE_INITIALIZATION");
                const initialized = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.initialize(providerRequest.providerRequestReference, identity.providerFingerprint, identity.providerReference, providerRequest.version, session);
                if (!initialized) {
                    this.fail("Provider initialization transition conflicted.", "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT");
                }
                const linked = await creatorWithdrawalRequest_repository_1.creatorWithdrawalRequestRepository.linkProviderInitialization({
                    requestId: withdrawal._id,
                    withdrawalReference: withdrawal.withdrawalReference,
                    providerRequestReference: initialized.providerRequestReference,
                    expectedVersion: withdrawal.version,
                }, session);
                if (!linked) {
                    this.fail("Withdrawal provider reference transition conflicted.", "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT");
                }
                await this.recordEvent(initialized, identity, internalProvider_1.ProviderEventType.WITHDRAWAL_PROVIDER_INITIALIZED, internalProvider_1.ProviderOperation.INITIALIZE_WITHDRAWAL_PROVIDER_REQUEST, identity.initializedTransitionKey, session);
                await this.onStage("BEFORE_AUDIT");
                await (0, auditLog_service_1.createFinancialAudit)({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_PROVIDER_INITIALIZED,
                    actor: {
                        type: "PROVIDER",
                        reference: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                    },
                    entityType: "INTERNAL_WITHDRAWAL_PROVIDER_REQUEST",
                    entityId: initialized._id,
                    financialContext: {
                        domain: "WITHDRAWAL",
                        primaryReference: initialized.withdrawalReference,
                        withdrawalReference: initialized.withdrawalReference,
                        provider: withdrawalProviderIdentity_util_1.INTERNAL_WITHDRAWAL_PROVIDER,
                        providerReference: identity.providerReference,
                        amount: initialized.amount,
                        currency: initialized.currency,
                    },
                    transition: {
                        fromStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.CREATED,
                        toStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
                        outcome: "SUCCEEDED",
                    },
                    metadata: {
                        creatorReference: initialized.creatorReference,
                        walletReference: initialized.walletReference,
                        destinationReference: initialized.destinationReference,
                        providerStatus: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.INITIALIZED,
                        reasonCode: "WITHDRAWAL_PROVIDER_IDENTITY_ESTABLISHED",
                    },
                    session,
                });
                await this.onStage("BEFORE_COMMIT");
                committedReference = initialized.providerRequestReference;
            });
            return committedReference;
        }
        finally {
            await session.endSession();
        }
    }
    async initialize(withdrawalReference) {
        if (typeof withdrawalReference !== "string" ||
            !withdrawalReference.trim()) {
            this.fail("Creator withdrawal request was not found.", "WITHDRAWAL_PROVIDER_WITHDRAWAL_MISSING");
        }
        const reference = withdrawalReference.trim();
        const existing = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(reference);
        if (existing)
            return this.validateReplay(reference);
        await this.resolveContext(reference);
        try {
            await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.validateReplay(reference);
        }
        catch (error) {
            this.fail("Creator withdrawal reservation authority is missing.", "WITHDRAWAL_PROVIDER_RESERVATION_MISSING", error);
        }
        let lastError;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const committedReference = await this.initializeTransaction(reference);
                if (!committedReference) {
                    this.fail("Provider initialization did not commit.", "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT");
                }
                const validated = await this.validateReplay(reference);
                return { ...validated, replay: false };
            }
            catch (error) {
                lastError = error;
                const winner = await internalWithdrawalProviderRequest_repository_1.internalWithdrawalProviderRequestRepository.findByWithdrawal(reference);
                if (winner)
                    return this.validateReplay(reference);
                if (error instanceof WithdrawalProviderInitializationError_1.WithdrawalProviderInitializationError &&
                    error.code !== "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT") {
                    throw error;
                }
                if (!isTransientTransactionError(error))
                    break;
            }
        }
        if (lastError instanceof WithdrawalProviderInitializationError_1.WithdrawalProviderInitializationError) {
            throw lastError;
        }
        this.fail("Withdrawal provider initialization transaction failed.", "WITHDRAWAL_PROVIDER_TRANSACTION_CONFLICT", lastError);
    }
}
exports.WithdrawalProviderInitializationService = WithdrawalProviderInitializationService;
exports.withdrawalProviderInitializationService = new WithdrawalProviderInitializationService();
