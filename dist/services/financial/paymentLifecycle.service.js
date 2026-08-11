"use strict";
// backend/src/services/financial/paymentLifecycle.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentLifecycleService = exports.PaymentLifecycleService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payment_service_1 = require("./payment.service");
const payment_repository_1 = require("../../repositories/payment.repository");
const providerPayment_service_1 = __importDefault(require("../internalProvider/payments/providerPayment.service"));
const settlement_service_1 = require("./settlement.service");
const ledger_service_1 = require("./ledger.service");
const creatorBalance_service_1 = require("./creatorBalance.service");
const refund_service_1 = require("./refund.service");
const paymentProviderRegistry_service_1 = require("./paymentProviderRegistry.service");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const refundReason_enum_1 = require("../../enums/financial/refundReason.enum");
const settlementStatus_enum_1 = require("../../enums/financial/settlementStatus.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const paymentFailureReason_enum_1 = require("../../enums/financial/paymentFailureReason.enum");
const escrowRecognition_service_1 = require("./escrowRecognition.service");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
class PaymentLifecycleService {
    constructor(payments = payment_service_1.paymentService, settlements = settlement_service_1.settlementService, ledger = ledger_service_1.ledgerService, balances = creatorBalance_service_1.creatorBalanceService, refunds = refund_service_1.refundService) {
        this.payments = payments;
        this.settlements = settlements;
        this.ledger = ledger;
        this.balances = balances;
        this.refunds = refunds;
    }
    /** Provider effects and Payment state are authoritative; secondary audit failure is non-fatal. */
    async auditSafely(params) {
        try {
            await (0, auditLog_service_1.createFinancialAudit)(params);
        }
        catch (error) {
            console.error("Financial audit write failed", error);
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Helpers                                                                */
    /* ---------------------------------------------------------------------- */
    toMoney(payment) {
        return {
            amount: payment.amount,
            currency: payment.currency,
        };
    }
    resolveTransactionId(payment) {
        return (payment.providerTransactionId ??
            payment.authorizationId ??
            payment.providerPaymentId ??
            payment.paymentReference);
    }
    validateObjectId(value, field) {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new PaymentError_1.PaymentError(`Invalid ${field}.`);
        }
    }
    validateInput(input) {
        this.validateObjectId(input.bookingId, "booking id");
        this.validateObjectId(input.userId, "user id");
        this.validateObjectId(input.creatorId, "creator id");
        if (!input.serviceAmount) {
            throw new PaymentError_1.PaymentError("Payment service amount is required.");
        }
        if (!input.provider) {
            throw new PaymentError_1.PaymentError("Payment provider is required.");
        }
        if (!input.method) {
            throw new PaymentError_1.PaymentError("Payment method is required.");
        }
    }
    resolveProvider(provider) {
        return paymentProviderRegistry_service_1.paymentProviderRegistry.get(provider);
    }
    ensureStatus(payment, expected) {
        if (!expected.includes(payment.status)) {
            throw new PaymentError_1.PaymentError(`Expected payment status [${expected.join(", ")}] but received '${payment.status}'.`);
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Payment Initialization                                                 */
    /* ---------------------------------------------------------------------- */
    async initiatePayment(input) {
        this.validateInput(input);
        const paymentInput = {
            bookingId: input.bookingId,
            userId: input.userId,
            creatorId: input.creatorId,
            serviceAmount: input.serviceAmount,
            provider: input.provider,
            method: input.method,
            attributes: input.attributes,
        };
        const payment = await this.payments.createPayment(paymentInput);
        return this.initializeExistingPayment(payment._id.toString());
    }
    async ensureCapturedEscrowRecognized(paymentId) {
        const session = await mongoose_1.default.startSession();
        let result = null;
        try {
            await session.withTransaction(async () => {
                const current = await payment_repository_1.paymentRepository.findById(new mongoose_1.default.Types.ObjectId(paymentId), session);
                if (!current)
                    throw new PaymentError_1.PaymentError("Payment not found.");
                if (current.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED) {
                    result = current;
                    return;
                }
                result = await escrowRecognition_service_1.escrowRecognitionService.recognizeCapturedPayment(current, session);
            });
        }
        finally {
            await session.endSession();
        }
        if (!result)
            throw new PaymentError_1.PaymentError("Captured payment escrow recognition failed.", "ESCROW_POSTING_FAILED");
        return result;
    }
    isFundsReleased(attributes) {
        const fundsRelease = attributes?.fundsRelease;
        return (typeof fundsRelease === "object" &&
            fundsRelease !== null &&
            "status" in fundsRelease &&
            fundsRelease.status === "RELEASED");
    }
    /**
     * Starts provider processing for a Payment that was already persisted by
     * the originating domain transaction.
     *
     * Booking creation uses this path so the Booking and Financial Payment are
     * committed atomically before provider-side state is created.
     */
    async initializeExistingPayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        if (payment.status === paymentStatus_enum_1.PaymentStatus.INITIALIZING) {
            if (!payment.providerPaymentId) {
                throw new PaymentError_1.PaymentError("Initialized payment is missing its provider payment id.");
            }
            return {
                payment,
                session: {
                    providerPaymentId: payment.providerPaymentId,
                    providerOrderId: payment.providerOrderId,
                    payload: payment.providerPayload,
                },
            };
        }
        this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.CREATED]);
        const provider = this.resolveProvider(payment.provider);
        const sessionRequest = {
            /**
             * Financial Domain payment identifier.
             */
            paymentId: payment._id.toString(),
            /**
             * Financial payment reference.
             */
            paymentReference: payment.paymentReference,
            /**
             * Booking information.
             */
            bookingId: payment.bookingId.toString(),
            /**
             * Marketplace participants.
             */
            userId: payment.userId.toString(),
            creatorId: payment.creatorId.toString(),
            /**
             * Payment details.
             */
            amount: this.toMoney(payment),
            provider: payment.provider,
            method: payment.method,
            /**
             * Duplicate protection.
             */
            idempotencyKey: payment.idempotencyKey,
        };
        const session = await provider.createPaymentSession(sessionRequest);
        const providerPayment = await providerPayment_service_1.default.findByProviderPaymentId(session.providerPaymentId);
        if (!providerPayment || !providerPayment.paymentId.equals(payment._id)) {
            throw new PaymentError_1.PaymentError("Provider payment does not belong to the Financial Payment.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        if (providerPayment.amount !== payment.amount) {
            throw new PaymentError_1.PaymentError("Provider payment amount does not match Financial Payment.", "PAYMENT_PROVIDER_AMOUNT_MISMATCH");
        }
        if (providerPayment.currency !== payment.currency) {
            throw new PaymentError_1.PaymentError("Provider payment currency does not match Financial Payment.", "PAYMENT_PROVIDER_CURRENCY_MISMATCH");
        }
        if (session.providerOrderId &&
            providerPayment.providerReference !== session.providerOrderId) {
            throw new PaymentError_1.PaymentError("Provider payment order identity is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        const providerState = await provider.getPaymentStatus({
            providerPaymentId: session.providerPaymentId,
        });
        if (providerState.providerPaymentId !== session.providerPaymentId ||
            providerState.providerStatus !== providerPayment.status) {
            throw new PaymentError_1.PaymentError("Provider payment status is inconsistent.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        const financialSession = await mongoose_1.default.startSession();
        let updatedPayment = null;
        try {
            await financialSession.withTransaction(async () => {
                const current = await payment_repository_1.paymentRepository.findById(payment._id, financialSession);
                if (!current) {
                    throw new PaymentError_1.PaymentError("Payment not found.");
                }
                if (current.provider !== payment.provider) {
                    throw new PaymentError_1.PaymentError("Financial Payment provider identity is inconsistent.", "PAYMENT_PROVIDER_LINK_CONFLICT");
                }
                if (current.providerPaymentId &&
                    current.providerPaymentId !== session.providerPaymentId) {
                    throw new PaymentError_1.PaymentError("Financial Payment cannot switch provider payment identity.", "PAYMENT_PROVIDER_LINK_CONFLICT");
                }
                if (current.status === paymentStatus_enum_1.PaymentStatus.INITIALIZING) {
                    updatedPayment = current;
                    return;
                }
                this.ensureStatus(current, [paymentStatus_enum_1.PaymentStatus.CREATED]);
                const linked = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.CREATED], {
                    status: paymentStatus_enum_1.PaymentStatus.INITIALIZING,
                    providerPaymentId: session.providerPaymentId,
                    providerOrderId: session.providerOrderId,
                    providerPayload: session.payload,
                }, financialSession);
                if (!linked) {
                    throw new PaymentError_1.PaymentError("Payment initialization transition conflicted.", "PAYMENT_LIFECYCLE_CONFLICT");
                }
                updatedPayment = linked;
            });
        }
        finally {
            await financialSession.endSession();
        }
        if (!updatedPayment) {
            throw new PaymentError_1.PaymentError("Payment initialization did not complete.");
        }
        const initializedPayment = updatedPayment;
        await this.auditSafely({ action: auditAction_enum_1.AuditAction.PAYMENT_INITIALIZED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: initializedPayment._id, financialContext: { domain: "PAYMENT", primaryReference: initializedPayment.paymentReference, paymentReference: initializedPayment.paymentReference, amount: initializedPayment.amount, currency: initializedPayment.currency, provider: initializedPayment.provider, providerReference: initializedPayment.providerPaymentId }, transition: { fromStatus: paymentStatus_enum_1.PaymentStatus.CREATED, toStatus: paymentStatus_enum_1.PaymentStatus.INITIALIZING, outcome: "PROCESSING" } });
        return {
            payment: initializedPayment,
            session,
        };
    }
    /**
     * Completes the provider-driven transition for an initialized payment.
     *
     * The provider remains responsible for provider-side state and event
     * persistence. This lifecycle consumes its responses to update only the
     * Financial Domain Payment.
     */
    async processProviderPayment(paymentId) {
        let payment = await this.payments.getPayment(paymentId);
        if (payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED &&
            payment.status !== paymentStatus_enum_1.PaymentStatus.SETTLED) {
            this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.INITIALIZING]);
            const authorizedPayment = await this.verifyPayment(paymentId);
            if (authorizedPayment.status === paymentStatus_enum_1.PaymentStatus.CAPTURED) {
                payment = authorizedPayment;
            }
            else {
                this.ensureStatus(authorizedPayment, [paymentStatus_enum_1.PaymentStatus.AUTHORIZED]);
                payment = await this.capturePayment(paymentId);
            }
        }
        this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.CAPTURED, paymentStatus_enum_1.PaymentStatus.SETTLED]);
        await this.settlePayment(paymentId);
        const completed = await this.completeSettlement(paymentId);
        return completed.payment;
    }
    /**
     * Executes the complete provider lifecycle for a Payment that has already
     * been created by another domain transaction, such as Booking creation.
     */
    async initializeAndProcessExistingPayment(paymentId) {
        return this.completePaymentLifecycle(paymentId);
    }
    /**
     * Phase 3 entry point. Provider execution happens before Financial state
     * transactions; Financial status advances only from persisted provider state.
     */
    async completePaymentLifecycle(paymentId) {
        const initialized = await this.initializeExistingPayment(paymentId);
        let payment = initialized.payment;
        if (payment.status === paymentStatus_enum_1.PaymentStatus.CAPTURED) {
            await this.auditSafely({ action: auditAction_enum_1.AuditAction.PAYMENT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "PAYMENT", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider, providerReference: payment.providerPaymentId, ledgerTransactionReference: payment.escrowLedgerTransactionReference }, transition: { fromStatus: paymentStatus_enum_1.PaymentStatus.CAPTURED, toStatus: paymentStatus_enum_1.PaymentStatus.CAPTURED, outcome: "REPLAYED" } });
            return { payment: await this.ensureCapturedEscrowRecognized(payment._id.toString()), session: initialized.session };
        }
        if (!payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Initialized payment is missing its provider payment id.");
        }
        const provider = this.resolveProvider(payment.provider);
        const verification = await provider.verifyPayment({
            providerPaymentId: payment.providerPaymentId,
        });
        if (!verification.verified) {
            throw new PaymentError_1.PaymentError("Provider payment verification failed.");
        }
        const providerState = await provider.getPaymentStatus({
            providerPaymentId: payment.providerPaymentId,
        });
        const providerPayment = await providerPayment_service_1.default.findByProviderPaymentId(payment.providerPaymentId);
        if (!providerPayment || !providerPayment.paymentId.equals(payment._id)) {
            throw new PaymentError_1.PaymentError("Provider payment does not belong to the Financial Payment.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
        }
        if (providerPayment.amount !== payment.amount) {
            throw new PaymentError_1.PaymentError("Provider payment amount does not match Financial Payment.", "PAYMENT_PROVIDER_AMOUNT_MISMATCH");
        }
        if (providerPayment.currency !== payment.currency) {
            throw new PaymentError_1.PaymentError("Provider payment currency does not match Financial Payment.", "PAYMENT_PROVIDER_CURRENCY_MISMATCH");
        }
        if (providerState.providerPaymentId !== payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Provider payment identifier is inconsistent.");
        }
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => {
                let current = await payment_repository_1.paymentRepository.findById(payment._id, session);
                if (!current)
                    throw new PaymentError_1.PaymentError("Payment not found.");
                if (current.providerPaymentId && current.providerPaymentId !== payment.providerPaymentId) {
                    throw new PaymentError_1.PaymentError("Financial Payment cannot switch provider payment identity.", "PAYMENT_PROVIDER_LINK_CONFLICT");
                }
                const providerData = {
                    providerPaymentId: payment.providerPaymentId,
                    providerOrderId: current.providerOrderId ?? initialized.session.providerOrderId,
                    providerTransactionId: providerState.providerTransactionId ?? verification.providerTransactionId,
                    providerPayload: providerState.payload ?? verification.payload,
                };
                if (current.status === paymentStatus_enum_1.PaymentStatus.CREATED) {
                    const linked = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.CREATED], { status: paymentStatus_enum_1.PaymentStatus.INITIALIZING, ...providerData }, session);
                    if (!linked)
                        throw new PaymentError_1.PaymentError("Payment initialization transition conflicted.");
                    current = linked;
                }
                if (["FAILED", "CANCELLED", "EXPIRED"].includes(providerState.providerStatus)) {
                    const failureReason = providerState.providerStatus === "CANCELLED"
                        ? paymentFailureReason_enum_1.PaymentFailureReason.PAYMENT_CANCELLED
                        : providerState.providerStatus === "EXPIRED"
                            ? paymentFailureReason_enum_1.PaymentFailureReason.PAYMENT_EXPIRED
                            : paymentFailureReason_enum_1.PaymentFailureReason.PROVIDER_ERROR;
                    const failureStatus = providerState.providerStatus === "CANCELLED"
                        ? paymentStatus_enum_1.PaymentStatus.CANCELLED
                        : providerState.providerStatus === "EXPIRED"
                            ? paymentStatus_enum_1.PaymentStatus.EXPIRED
                            : paymentStatus_enum_1.PaymentStatus.FAILED;
                    const failed = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.INITIALIZING, paymentStatus_enum_1.PaymentStatus.AUTHORIZED], { status: failureStatus, failureReason, ...providerData }, session);
                    if (!failed) {
                        throw new PaymentError_1.PaymentError("Payment failure transition conflicted.", "PAYMENT_LIFECYCLE_CONFLICT");
                    }
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYMENT_FAILED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: failed._id, financialContext: { domain: "PAYMENT", primaryReference: failed.paymentReference, paymentReference: failed.paymentReference, amount: failed.amount, currency: failed.currency, provider: failed.provider, providerReference: failed.providerPaymentId }, transition: { fromStatus: current.status, toStatus: failureStatus, outcome: "FAILED" }, session });
                    payment = failed;
                    return;
                }
                if (providerState.providerStatus === "CAPTURED") {
                    if (current.status === paymentStatus_enum_1.PaymentStatus.INITIALIZING) {
                        const authorized = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.INITIALIZING], { status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED, ...providerData, authorizationId: providerData.providerTransactionId }, session);
                        if (!authorized)
                            throw new PaymentError_1.PaymentError("Payment authorization transition conflicted.");
                        await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYMENT_AUTHORIZED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: authorized._id, financialContext: { domain: "PAYMENT", primaryReference: authorized.paymentReference, paymentReference: authorized.paymentReference, amount: authorized.amount, currency: authorized.currency, provider: authorized.provider, providerReference: authorized.providerPaymentId }, transition: { fromStatus: paymentStatus_enum_1.PaymentStatus.INITIALIZING, toStatus: paymentStatus_enum_1.PaymentStatus.AUTHORIZED, outcome: "PROCESSING" }, session });
                        current = authorized;
                    }
                    if (current.status === paymentStatus_enum_1.PaymentStatus.AUTHORIZED) {
                        const captured = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.AUTHORIZED], { status: paymentStatus_enum_1.PaymentStatus.CAPTURED, ...providerData }, session);
                        if (!captured)
                            throw new PaymentError_1.PaymentError("Payment capture transition conflicted.");
                        await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYMENT_CAPTURED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: captured._id, financialContext: { domain: "PAYMENT", primaryReference: captured.paymentReference, paymentReference: captured.paymentReference, amount: captured.amount, currency: captured.currency, provider: captured.provider, providerReference: captured.providerPaymentId }, transition: { fromStatus: paymentStatus_enum_1.PaymentStatus.AUTHORIZED, toStatus: paymentStatus_enum_1.PaymentStatus.CAPTURED, outcome: "SUCCEEDED" }, session });
                        current = captured;
                    }
                }
                else if (providerState.providerStatus === "AUTHORIZED" && current.status === paymentStatus_enum_1.PaymentStatus.INITIALIZING) {
                    const authorized = await payment_repository_1.paymentRepository.transition(current._id, [paymentStatus_enum_1.PaymentStatus.INITIALIZING], { status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED, ...providerData, authorizationId: providerData.providerTransactionId }, session);
                    if (!authorized)
                        throw new PaymentError_1.PaymentError("Payment authorization transition conflicted.");
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYMENT_AUTHORIZED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: authorized._id, financialContext: { domain: "PAYMENT", primaryReference: authorized.paymentReference, paymentReference: authorized.paymentReference, amount: authorized.amount, currency: authorized.currency, provider: authorized.provider, providerReference: authorized.providerPaymentId }, transition: { fromStatus: paymentStatus_enum_1.PaymentStatus.INITIALIZING, toStatus: paymentStatus_enum_1.PaymentStatus.AUTHORIZED, outcome: "PROCESSING" }, session });
                    current = authorized;
                }
                else if (providerState.providerStatus !== "CAPTURED" && providerState.providerStatus !== "AUTHORIZED") {
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.PAYMENT_OUTCOME_UNKNOWN, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: current._id, financialContext: { domain: "PAYMENT", primaryReference: current.paymentReference, paymentReference: current.paymentReference, amount: current.amount, currency: current.currency, provider: current.provider, providerReference: current.providerPaymentId }, transition: { fromStatus: current.status, toStatus: current.status, outcome: "UNKNOWN" }, session });
                    throw new PaymentError_1.PaymentError(`Provider status '${providerState.providerStatus}' cannot advance the Financial Payment.`);
                }
                if (current.status === paymentStatus_enum_1.PaymentStatus.CAPTURED) {
                    await escrowRecognition_service_1.escrowRecognitionService.recognizeCapturedPayment(current, session);
                }
                payment = current;
            });
        }
        finally {
            await session.endSession();
        }
        return { payment, session: initialized.session };
    }
    /* ---------------------------------------------------------------------- */
    /* Payment Verification                                                   */
    /* ---------------------------------------------------------------------- */
    async verifyPayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        if (!payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Provider payment id has not been assigned.");
        }
        const provider = this.resolveProvider(payment.provider);
        const result = await provider.verifyPayment({
            providerPaymentId: payment.providerPaymentId,
        });
        if (!result.verified) {
            throw new PaymentError_1.PaymentError("Payment verification failed.");
        }
        if (result.payload) {
            await this.payments.updateProviderPayload(paymentId, result.payload);
        }
        if (result.providerTransactionId) {
            await this.payments.updateProviderReferences(paymentId, {
                providerTransactionId: result.providerTransactionId,
            });
            await this.payments.markAuthorized(paymentId, result.providerTransactionId);
        }
        else {
            await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
        }
        return this.payments.getPayment(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Capture                                                                */
    /* ---------------------------------------------------------------------- */
    async capturePayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.AUTHORIZED]);
        if (!payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Provider payment id has not been assigned.");
        }
        const provider = this.resolveProvider(payment.provider);
        const providerStatus = await provider.getPaymentStatus({
            providerPaymentId: payment.providerPaymentId,
        });
        if (providerStatus.payload) {
            await this.payments.updateProviderPayload(paymentId, providerStatus.payload);
        }
        if (providerStatus.providerTransactionId) {
            await this.payments.updateProviderReferences(paymentId, {
                providerTransactionId: providerStatus.providerTransactionId,
            });
        }
        switch (providerStatus.providerStatus) {
            case "AUTHORIZED": {
                const transactionId = providerStatus.providerTransactionId ??
                    payment.providerTransactionId ??
                    payment.authorizationId ??
                    payment.providerPaymentId;
                await this.payments.markCaptured(paymentId, transactionId);
                break;
            }
            case "CAPTURED": {
                const transactionId = providerStatus.providerTransactionId ??
                    payment.providerTransactionId ??
                    payment.authorizationId ??
                    payment.providerPaymentId;
                await this.payments.markCaptured(paymentId, transactionId);
                break;
            }
            case "SETTLED": {
                const transactionId = providerStatus.providerTransactionId ??
                    payment.providerTransactionId ??
                    payment.authorizationId ??
                    payment.providerPaymentId;
                await this.payments.markCaptured(paymentId, transactionId);
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.SETTLED);
                break;
            }
            default:
                throw new PaymentError_1.PaymentError(`Provider payment cannot be captured from '${providerStatus.providerStatus}'.`);
        }
        return this.payments.getPayment(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Synchronization                                                        */
    /* ---------------------------------------------------------------------- */
    async synchronizePayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        if (!payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Provider payment id has not been assigned.");
        }
        const provider = this.resolveProvider(payment.provider);
        const providerStatus = await provider.getPaymentStatus({
            providerPaymentId: payment.providerPaymentId,
        });
        if (providerStatus.payload) {
            await this.payments.updateProviderPayload(paymentId, providerStatus.payload);
        }
        await this.payments.updateProviderReferences(paymentId, {
            providerPaymentId: providerStatus.providerPaymentId,
            providerTransactionId: providerStatus.providerTransactionId,
        });
        switch (providerStatus.providerStatus) {
            case "CREATED":
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.CREATED);
                break;
            case "INITIALIZING":
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.INITIALIZING);
                break;
            case "PENDING":
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.PENDING);
                break;
            case "AUTHORIZED":
                if (providerStatus.providerTransactionId) {
                    await this.payments.markAuthorized(paymentId, providerStatus.providerTransactionId);
                }
                else {
                    await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.AUTHORIZED);
                }
                break;
            case "CAPTURED":
                await this.payments.markCaptured(paymentId, providerStatus.providerTransactionId ??
                    payment.providerTransactionId ??
                    payment.authorizationId ??
                    payment.providerPaymentId);
                break;
            case "SETTLED":
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.SETTLED);
                break;
            case "FAILED":
                await this.payments.markFailed(paymentId, paymentFailureReason_enum_1.PaymentFailureReason.PROVIDER_ERROR, "Provider reported payment failure.");
                break;
            case "CANCELLED":
                await this.payments.markCancelled(paymentId);
                break;
            case "EXPIRED":
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.EXPIRED);
                break;
            case "REFUNDED":
                await this.payments.markRefunded(paymentId);
                break;
            default:
                break;
        }
        return this.payments.getPayment(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Settlement                                                             */
    /* ---------------------------------------------------------------------- */
    async settlePayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.CAPTURED, paymentStatus_enum_1.PaymentStatus.SETTLED]);
        const existingSettlements = await this.settlements.getByPayment(payment._id.toString());
        let settlement = existingSettlements.length > 0 ? existingSettlements[0] : null;
        if (!settlement) {
            settlement = await this.settlements.createSettlement({
                paymentId: payment._id.toString(),
                bookingId: payment.bookingId.toString(),
                userId: payment.userId.toString(),
                creatorId: payment.creatorId.toString(),
                amount: this.toMoney(payment),
                provider: payment.provider,
            });
        }
        if (settlement.status === settlementStatus_enum_1.SettlementStatus.COMPLETED) {
            return settlement;
        }
        if (settlement.status === settlementStatus_enum_1.SettlementStatus.CREATED ||
            settlement.status === settlementStatus_enum_1.SettlementStatus.PENDING) {
            await this.settlements.markProcessing(settlement._id.toString());
        }
        return this.settlements.getSettlement(settlement._id.toString());
    }
    /* ---------------------------------------------------------------------- */
    /* Ledger Posting                                                         */
    /* ---------------------------------------------------------------------- */
    async postSettlementLedger(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        const settlements = await this.settlements.getByPayment(paymentId);
        const settlement = settlements.length > 0 ? settlements[0] : null;
        if (!settlement) {
            throw new PaymentError_1.PaymentError("Settlement does not exist.");
        }
        const existingLedgerEntries = await this.ledger.getBySettlement(settlement._id.toString());
        const settlementLedgerExists = existingLedgerEntries.some((entry) => entry.paymentId?.toString() === payment._id.toString() &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.SETTLEMENT &&
            entry.source === ledgerSource_enum_1.LedgerSource.SETTLEMENT);
        if (settlementLedgerExists) {
            return;
        }
        await this.ledger.createCredit({
            bookingId: payment.bookingId.toString(),
            userId: payment.creatorId.toString(),
            paymentId: payment._id.toString(),
            settlementId: settlement._id.toString(),
            transactionId: payment.providerTransactionId ??
                payment.authorizationId ??
                payment.providerPaymentId ??
                payment.paymentReference,
            money: this.toMoney(payment),
            type: ledgerEntryType_enum_1.LedgerEntryType.SETTLEMENT,
            source: ledgerSource_enum_1.LedgerSource.SETTLEMENT,
            description: "Booking payment settled",
        });
    }
    /* ---------------------------------------------------------------------- */
    /* Creator Balance                                                        */
    /* ---------------------------------------------------------------------- */
    async creditCreatorBalance(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        await this.balances.createBalance({
            creatorId: payment.creatorId.toString(),
            currency: payment.currency,
        });
        await this.balances.increasePendingBalance({
            creatorId: payment.creatorId.toString(),
            money: this.toMoney(payment),
        });
    }
    /* ---------------------------------------------------------------------- */
    /* Settlement Completion                                                  */
    /* ---------------------------------------------------------------------- */
    async completeSettlement(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        const settlements = await this.settlements.getByPayment(paymentId);
        const settlement = settlements.length > 0 ? settlements[0] : null;
        if (!settlement) {
            throw new PaymentError_1.PaymentError("Settlement not found.");
        }
        if (settlement.status === settlementStatus_enum_1.SettlementStatus.COMPLETED) {
            if (payment.status !== paymentStatus_enum_1.PaymentStatus.SETTLED) {
                await this.payments.markSettled(paymentId, settlement._id.toString());
            }
            return {
                payment: await this.payments.getPayment(paymentId),
                settlement,
            };
        }
        await this.postSettlementLedger(paymentId);
        await this.creditCreatorBalance(paymentId);
        await this.settlements.markCompleted(settlement._id.toString());
        await this.payments.markSettled(paymentId, settlement._id.toString());
        return {
            payment: await this.payments.getPayment(paymentId),
            settlement: await this.settlements.getSettlement(settlement._id.toString()),
        };
    }
    /* ---------------------------------------------------------------------- */
    /* Funds Availability                                                     */
    /* ---------------------------------------------------------------------- */
    async releasePendingFunds(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [paymentStatus_enum_1.PaymentStatus.SETTLED]);
        const session = await mongoose_1.default.startSession();
        let releasedSettlement = null;
        try {
            await session.withTransaction(async () => {
                const settlements = await this.settlements.getByPayment(paymentId, session);
                const settlement = settlements.length > 0 ? settlements[0] : null;
                if (!settlement) {
                    throw new PaymentError_1.PaymentError("Settlement not found.");
                }
                if (settlement.status !== settlementStatus_enum_1.SettlementStatus.COMPLETED) {
                    throw new PaymentError_1.PaymentError("Settlement has not completed.");
                }
                if (this.isFundsReleased(settlement.attributes)) {
                    releasedSettlement = settlement;
                    return;
                }
                await this.balances.createBalance({
                    creatorId: payment.creatorId.toString(),
                    currency: payment.currency,
                }, session);
                await this.balances.transferBalance({
                    creatorId: payment.creatorId.toString(),
                    from: "pendingBalance",
                    to: "availableBalance",
                    money: this.toMoney(payment),
                }, session);
                const fundsRelease = {
                    status: "RELEASED",
                    paymentId: payment._id.toString(),
                    amount: payment.amount,
                    currency: payment.currency,
                    releasedAt: new Date(),
                };
                releasedSettlement = await this.settlements.updateAttributes(settlement._id.toString(), {
                    ...(settlement.attributes ?? {}),
                    fundsRelease,
                }, session);
            });
        }
        finally {
            await session.endSession();
        }
        if (!releasedSettlement) {
            throw new PaymentError_1.PaymentError("Failed to release pending funds.");
        }
        return {
            payment,
            settlement: releasedSettlement,
        };
    }
    /* ---------------------------------------------------------------------- */
    /* Settlement Failure                                                     */
    /* ---------------------------------------------------------------------- */
    async failSettlement(paymentId, reason) {
        const settlements = await this.settlements.getByPayment(paymentId);
        const settlement = settlements.length > 0 ? settlements[0] : null;
        if (!settlement) {
            throw new PaymentError_1.PaymentError("Settlement not found.");
        }
        if (settlement.status === settlementStatus_enum_1.SettlementStatus.FAILED) {
            return;
        }
        await this.settlements.markFailed(settlement._id.toString(), reason);
    }
    /* ---------------------------------------------------------------------- */
    /* Refund                                                                 */
    /* ---------------------------------------------------------------------- */
    async refundPayment(paymentId, amount, reason = refundReason_enum_1.RefundReason.OTHER) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [
            paymentStatus_enum_1.PaymentStatus.CAPTURED,
            paymentStatus_enum_1.PaymentStatus.SETTLED,
            paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED,
        ]);
        if (!payment.providerPaymentId) {
            throw new PaymentError_1.PaymentError("Provider payment id has not been assigned.");
        }
        const provider = this.resolveProvider(payment.provider);
        const refundAmount = amount ?? this.toMoney(payment);
        const refund = await this.refunds.createRefund({
            paymentId: payment._id.toString(),
            bookingId: payment.bookingId.toString(),
            userId: payment.userId.toString(),
            creatorId: payment.creatorId.toString(),
            amount: refundAmount,
            reason,
        });
        await this.refunds.markProcessing(refund._id.toString());
        const providerRefund = await provider.createRefund({
            refundId: refund._id.toString(),
            bookingId: payment.bookingId.toString(),
            refundReference: refund.refundReference,
            paymentReference: payment.paymentReference,
            providerPaymentId: payment.providerPaymentId,
            amount: refundAmount,
            reason,
            idempotencyKey: refund.idempotencyKey,
            metadata: {},
        });
        await this.refunds.updateProviderReferences(refund._id.toString(), {
            providerRefundId: providerRefund.providerRefundId,
        });
        if (providerRefund.payload) {
            await this.refunds.updateProviderPayload(refund._id.toString(), providerRefund.payload);
        }
        if (providerRefund.providerStatus === "COMPLETED") {
            await this.refunds.markCompleted(refund._id.toString());
            if (refundAmount.amount >= payment.amount) {
                await this.payments.markRefunded(paymentId);
            }
            else {
                await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.PARTIALLY_REFUNDED);
            }
        }
        return this.refunds.getRefund(refund._id.toString());
    }
    /* ---------------------------------------------------------------------- */
    /* Cancellation                                                           */
    /* ---------------------------------------------------------------------- */
    async cancelPayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [
            paymentStatus_enum_1.PaymentStatus.CREATED,
            paymentStatus_enum_1.PaymentStatus.INITIALIZING,
            paymentStatus_enum_1.PaymentStatus.PENDING,
            paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
        ]);
        await this.payments.markCancelled(paymentId);
        return this.payments.getPayment(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Expiry                                                                 */
    /* ---------------------------------------------------------------------- */
    async expirePayment(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        this.ensureStatus(payment, [
            paymentStatus_enum_1.PaymentStatus.CREATED,
            paymentStatus_enum_1.PaymentStatus.INITIALIZING,
            paymentStatus_enum_1.PaymentStatus.PENDING,
        ]);
        await this.payments.updateStatus(paymentId, paymentStatus_enum_1.PaymentStatus.EXPIRED);
        return this.payments.getPayment(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Integrity                                                              */
    /* ---------------------------------------------------------------------- */
    async verifyIntegrity(paymentId) {
        const payment = await this.payments.getPayment(paymentId);
        if (payment.status === paymentStatus_enum_1.PaymentStatus.AUTHORIZED &&
            !payment.authorizationId) {
            return false;
        }
        if (payment.status === paymentStatus_enum_1.PaymentStatus.CAPTURED &&
            !payment.providerTransactionId) {
            return false;
        }
        if (payment.status === paymentStatus_enum_1.PaymentStatus.SETTLED && !payment.settlementId) {
            return false;
        }
        return this.payments.verifyIntegrity(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Retry                                                                  */
    /* ---------------------------------------------------------------------- */
    async retryVerification(paymentId) {
        return this.verifyPayment(paymentId);
    }
    async retrySynchronization(paymentId) {
        return this.synchronizePayment(paymentId);
    }
    /** Explicit operations-layer entry point; delegates to the existing lifecycle synchronization. */
    async adminSynchronizePayment(paymentId) {
        return this.retrySynchronization(paymentId);
    }
    /* ---------------------------------------------------------------------- */
    /* Lookup                                                                 */
    /* ---------------------------------------------------------------------- */
    async getPayment(paymentId) {
        return this.payments.getPayment(paymentId);
    }
    async paymentExists(paymentId) {
        return this.payments.exists(paymentId);
    }
}
exports.PaymentLifecycleService = PaymentLifecycleService;
exports.paymentLifecycleService = new PaymentLifecycleService();
