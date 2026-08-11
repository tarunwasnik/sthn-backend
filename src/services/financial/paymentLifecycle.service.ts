// backend/src/services/financial/paymentLifecycle.service.ts

import mongoose from "mongoose";

import { IPayment } from "../../models/payment.model";
import { ISettlement } from "../../models/settlement.model";

import { paymentService, CreatePaymentInput } from "./payment.service";
import { paymentRepository } from "../../repositories/payment.repository";
import ProviderPaymentService from "../internalProvider/payments/providerPayment.service";

import { settlementService } from "./settlement.service";
import { ledgerService } from "./ledger.service";
import { creatorBalanceService } from "./creatorBalance.service";
import { refundService } from "./refund.service";

import { paymentProviderRegistry } from "./paymentProviderRegistry.service";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";

import { RefundReason } from "../../enums/financial/refundReason.enum";
import { SettlementStatus } from "../../enums/financial/settlementStatus.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";

import { Money } from "../../types/financial/money.type";

import { PaymentError } from "../../errors/financial/PaymentError";

import {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
} from "../../contracts/financial/paymentProvider.types";
import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { escrowRecognitionService } from "./escrowRecognition.service";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";

export interface InitiatePaymentInput {
  bookingId: string;

  userId: string;

  creatorId: string;

  serviceAmount: Money;

  provider: PaymentProvider;

  method: PaymentMethod;

  metadata?: Record<string, unknown>;

  attributes?: Record<string, unknown>;
}

interface FundsReleaseMarker {
  status: "RELEASED";
  paymentId: string;
  amount: number;
  currency: string;
  releasedAt: Date;
}

export class PaymentLifecycleService {
  constructor(
    private readonly payments = paymentService,
    private readonly settlements = settlementService,
    private readonly ledger = ledgerService,
    private readonly balances = creatorBalanceService,
    private readonly refunds = refundService,
  ) {}

  /** Provider effects and Payment state are authoritative; secondary audit failure is non-fatal. */
  private async auditSafely(params: Parameters<typeof createFinancialAudit>[0]): Promise<void> {
    try { await createFinancialAudit(params); } catch (error) { console.error("Financial audit write failed", error); }
  }

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  private toMoney(payment: IPayment): Money {
    return {
      amount: payment.amount,
      currency: payment.currency,
    };
  }

  private resolveTransactionId(payment: IPayment): string {
    return (
      payment.providerTransactionId ??
      payment.authorizationId ??
      payment.providerPaymentId ??
      payment.paymentReference
    );
  }

  private validateObjectId(value: string, field: string): void {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new PaymentError(`Invalid ${field}.`);
    }
  }

  private validateInput(input: InitiatePaymentInput): void {
    this.validateObjectId(input.bookingId, "booking id");

    this.validateObjectId(input.userId, "user id");

    this.validateObjectId(input.creatorId, "creator id");

    if (!input.serviceAmount) {
      throw new PaymentError("Payment service amount is required.");
    }

    if (!input.provider) {
      throw new PaymentError("Payment provider is required.");
    }

    if (!input.method) {
      throw new PaymentError("Payment method is required.");
    }
  }

  private resolveProvider(provider: PaymentProvider) {
    return paymentProviderRegistry.get(provider);
  }

  private ensureStatus(payment: IPayment, expected: PaymentStatus[]): void {
    if (!expected.includes(payment.status)) {
      throw new PaymentError(
        `Expected payment status [${expected.join(
          ", ",
        )}] but received '${payment.status}'.`,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Payment Initialization                                                 */
  /* ---------------------------------------------------------------------- */

  async initiatePayment(input: InitiatePaymentInput): Promise<{
    payment: IPayment;
    session: CreatePaymentSessionResponse;
  }> {
    this.validateInput(input);

    const paymentInput: CreatePaymentInput = {
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

  private async ensureCapturedEscrowRecognized(paymentId: string): Promise<IPayment> {
    const session = await mongoose.startSession();
    let result: IPayment | null = null;
    try {
      await session.withTransaction(async () => {
        const current = await paymentRepository.findById(new mongoose.Types.ObjectId(paymentId), session);
        if (!current) throw new PaymentError("Payment not found.");
        if (current.status !== PaymentStatus.CAPTURED) { result = current; return; }
        result = await escrowRecognitionService.recognizeCapturedPayment(current, session);
      });
    } finally { await session.endSession(); }
    if (!result) throw new PaymentError("Captured payment escrow recognition failed.", "ESCROW_POSTING_FAILED");
    return result;
  }

  private isFundsReleased(attributes?: Record<string, unknown>): boolean {
    const fundsRelease = attributes?.fundsRelease;

    return (
      typeof fundsRelease === "object" &&
      fundsRelease !== null &&
      "status" in fundsRelease &&
      fundsRelease.status === "RELEASED"
    );
  }

  /**
   * Starts provider processing for a Payment that was already persisted by
   * the originating domain transaction.
   *
   * Booking creation uses this path so the Booking and Financial Payment are
   * committed atomically before provider-side state is created.
   */
  async initializeExistingPayment(paymentId: string): Promise<{
    payment: IPayment;
    session: CreatePaymentSessionResponse;
  }> {
    const payment = await this.payments.getPayment(paymentId);

    if (payment.status === PaymentStatus.INITIALIZING) {
      if (!payment.providerPaymentId) {
        throw new PaymentError(
          "Initialized payment is missing its provider payment id.",
        );
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

    this.ensureStatus(payment, [PaymentStatus.CREATED]);

    const provider = this.resolveProvider(payment.provider);

    const sessionRequest: CreatePaymentSessionRequest = {
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

    const providerPayment = await ProviderPaymentService.findByProviderPaymentId(
      session.providerPaymentId,
    );

    if (!providerPayment || !providerPayment.paymentId.equals(payment._id)) {
      throw new PaymentError(
        "Provider payment does not belong to the Financial Payment.",
        "PAYMENT_PROVIDER_REFERENCE_MISMATCH",
      );
    }

    if (providerPayment.amount !== payment.amount) {
      throw new PaymentError(
        "Provider payment amount does not match Financial Payment.",
        "PAYMENT_PROVIDER_AMOUNT_MISMATCH",
      );
    }

    if (providerPayment.currency !== payment.currency) {
      throw new PaymentError(
        "Provider payment currency does not match Financial Payment.",
        "PAYMENT_PROVIDER_CURRENCY_MISMATCH",
      );
    }

    if (
      session.providerOrderId &&
      providerPayment.providerReference !== session.providerOrderId
    ) {
      throw new PaymentError(
        "Provider payment order identity is inconsistent.",
        "PAYMENT_PROVIDER_REFERENCE_MISMATCH",
      );
    }

    const providerState = await provider.getPaymentStatus({
      providerPaymentId: session.providerPaymentId,
    });

    if (
      providerState.providerPaymentId !== session.providerPaymentId ||
      providerState.providerStatus !== providerPayment.status
    ) {
      throw new PaymentError(
        "Provider payment status is inconsistent.",
        "PAYMENT_PROVIDER_REFERENCE_MISMATCH",
      );
    }

    const financialSession = await mongoose.startSession();
    let updatedPayment: IPayment | null = null;

    try {
      await financialSession.withTransaction(async () => {
        const current = await paymentRepository.findById(
          payment._id,
          financialSession,
        );

        if (!current) {
          throw new PaymentError("Payment not found.");
        }

        if (current.provider !== payment.provider) {
          throw new PaymentError(
            "Financial Payment provider identity is inconsistent.",
            "PAYMENT_PROVIDER_LINK_CONFLICT",
          );
        }

        if (
          current.providerPaymentId &&
          current.providerPaymentId !== session.providerPaymentId
        ) {
          throw new PaymentError(
            "Financial Payment cannot switch provider payment identity.",
            "PAYMENT_PROVIDER_LINK_CONFLICT",
          );
        }

        if (current.status === PaymentStatus.INITIALIZING) {
          updatedPayment = current;
          return;
        }

        this.ensureStatus(current, [PaymentStatus.CREATED]);

        const linked = await paymentRepository.transition(
          current._id,
          [PaymentStatus.CREATED],
          {
            status: PaymentStatus.INITIALIZING,
            providerPaymentId: session.providerPaymentId,
            providerOrderId: session.providerOrderId,
            providerPayload: session.payload,
          },
          financialSession,
        );

        if (!linked) {
          throw new PaymentError(
            "Payment initialization transition conflicted.",
            "PAYMENT_LIFECYCLE_CONFLICT",
          );
        }

        updatedPayment = linked;
      });
    } finally {
      await financialSession.endSession();
    }

    if (!updatedPayment) {
      throw new PaymentError("Payment initialization did not complete.");
    }
    const initializedPayment = updatedPayment as IPayment;

    await this.auditSafely({ action: AuditAction.PAYMENT_INITIALIZED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: initializedPayment._id, financialContext: { domain: "PAYMENT", primaryReference: initializedPayment.paymentReference, paymentReference: initializedPayment.paymentReference, amount: initializedPayment.amount, currency: initializedPayment.currency, provider: initializedPayment.provider, providerReference: initializedPayment.providerPaymentId }, transition: { fromStatus: PaymentStatus.CREATED, toStatus: PaymentStatus.INITIALIZING, outcome: "PROCESSING" } });

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
  async processProviderPayment(paymentId: string): Promise<IPayment> {
    let payment = await this.payments.getPayment(paymentId);

    if (
      payment.status !== PaymentStatus.CAPTURED &&
      payment.status !== PaymentStatus.SETTLED
    ) {
      this.ensureStatus(payment, [PaymentStatus.INITIALIZING]);

      const authorizedPayment = await this.verifyPayment(paymentId);

      if (authorizedPayment.status === PaymentStatus.CAPTURED) {
        payment = authorizedPayment;
      } else {
        this.ensureStatus(authorizedPayment, [PaymentStatus.AUTHORIZED]);

        payment = await this.capturePayment(paymentId);
      }
    }

    this.ensureStatus(payment, [PaymentStatus.CAPTURED, PaymentStatus.SETTLED]);

    await this.settlePayment(paymentId);

    const completed = await this.completeSettlement(paymentId);

    return completed.payment;
  }

  /**
   * Executes the complete provider lifecycle for a Payment that has already
   * been created by another domain transaction, such as Booking creation.
   */
  async initializeAndProcessExistingPayment(paymentId: string): Promise<{
    payment: IPayment;
    session: CreatePaymentSessionResponse;
  }> {
    return this.completePaymentLifecycle(paymentId);
  }

  /**
   * Phase 3 entry point. Provider execution happens before Financial state
   * transactions; Financial status advances only from persisted provider state.
   */
  async completePaymentLifecycle(paymentId: string): Promise<{
    payment: IPayment;
    session: CreatePaymentSessionResponse;
  }> {
    const initialized = await this.initializeExistingPayment(paymentId);
    let payment = initialized.payment;

    if (payment.status === PaymentStatus.CAPTURED) {
      await this.auditSafely({ action: AuditAction.PAYMENT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "payment-lifecycle" }, entityType: "PAYMENT", entityId: payment._id, financialContext: { domain: "PAYMENT", primaryReference: payment.paymentReference, paymentReference: payment.paymentReference, amount: payment.amount, currency: payment.currency, provider: payment.provider, providerReference: payment.providerPaymentId, ledgerTransactionReference: payment.escrowLedgerTransactionReference }, transition: { fromStatus: PaymentStatus.CAPTURED, toStatus: PaymentStatus.CAPTURED, outcome: "REPLAYED" } });
      return { payment: await this.ensureCapturedEscrowRecognized(payment._id.toString()), session: initialized.session };
    }

    if (!payment.providerPaymentId) {
      throw new PaymentError("Initialized payment is missing its provider payment id.");
    }

    const provider = this.resolveProvider(payment.provider);
    const verification = await provider.verifyPayment({
      providerPaymentId: payment.providerPaymentId,
    });
    if (!verification.verified) {
      throw new PaymentError("Provider payment verification failed.");
    }

    const providerState = await provider.getPaymentStatus({
      providerPaymentId: payment.providerPaymentId,
    });
    const providerPayment = await ProviderPaymentService.findByProviderPaymentId(
      payment.providerPaymentId,
    );
    if (!providerPayment || !providerPayment.paymentId.equals(payment._id)) {
      throw new PaymentError("Provider payment does not belong to the Financial Payment.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    }
    if (providerPayment.amount !== payment.amount) {
      throw new PaymentError("Provider payment amount does not match Financial Payment.", "PAYMENT_PROVIDER_AMOUNT_MISMATCH");
    }
    if (providerPayment.currency !== payment.currency) {
      throw new PaymentError("Provider payment currency does not match Financial Payment.", "PAYMENT_PROVIDER_CURRENCY_MISMATCH");
    }
    if (providerState.providerPaymentId !== payment.providerPaymentId) {
      throw new PaymentError("Provider payment identifier is inconsistent.");
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        let current = await paymentRepository.findById(payment._id, session);
        if (!current) throw new PaymentError("Payment not found.");
        if (current.providerPaymentId && current.providerPaymentId !== payment.providerPaymentId) {
          throw new PaymentError("Financial Payment cannot switch provider payment identity.", "PAYMENT_PROVIDER_LINK_CONFLICT");
        }

        const providerData = {
          providerPaymentId: payment.providerPaymentId,
          providerOrderId: current.providerOrderId ?? initialized.session.providerOrderId,
          providerTransactionId: providerState.providerTransactionId ?? verification.providerTransactionId,
          providerPayload: providerState.payload ?? verification.payload,
        };

        if (current.status === PaymentStatus.CREATED) {
          const linked = await paymentRepository.transition(
            current._id,
            [PaymentStatus.CREATED],
            { status: PaymentStatus.INITIALIZING, ...providerData },
            session,
          );
          if (!linked) throw new PaymentError("Payment initialization transition conflicted.");
          current = linked;
        }

        if (["FAILED", "CANCELLED", "EXPIRED"].includes(providerState.providerStatus)) {
          const failureReason = providerState.providerStatus === "CANCELLED"
            ? PaymentFailureReason.PAYMENT_CANCELLED
            : providerState.providerStatus === "EXPIRED"
              ? PaymentFailureReason.PAYMENT_EXPIRED
              : PaymentFailureReason.PROVIDER_ERROR;
          const failureStatus = providerState.providerStatus === "CANCELLED"
            ? PaymentStatus.CANCELLED
            : providerState.providerStatus === "EXPIRED"
              ? PaymentStatus.EXPIRED
              : PaymentStatus.FAILED;
          const failed = await paymentRepository.transition(
            current._id,
            [PaymentStatus.INITIALIZING, PaymentStatus.AUTHORIZED],
            { status: failureStatus, failureReason, ...providerData },
            session,
          );
          if (!failed) {
            throw new PaymentError("Payment failure transition conflicted.", "PAYMENT_LIFECYCLE_CONFLICT");
          }
          await createFinancialAudit({ action: AuditAction.PAYMENT_FAILED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: failed._id, financialContext: { domain: "PAYMENT", primaryReference: failed.paymentReference, paymentReference: failed.paymentReference, amount: failed.amount, currency: failed.currency, provider: failed.provider, providerReference: failed.providerPaymentId }, transition: { fromStatus: current.status, toStatus: failureStatus, outcome: "FAILED" }, session });
          payment = failed;
          return;
        }

        if (providerState.providerStatus === "CAPTURED") {
          if (current.status === PaymentStatus.INITIALIZING) {
            const authorized = await paymentRepository.transition(
              current._id,
              [PaymentStatus.INITIALIZING],
              { status: PaymentStatus.AUTHORIZED, ...providerData, authorizationId: providerData.providerTransactionId },
              session,
            );
            if (!authorized) throw new PaymentError("Payment authorization transition conflicted.");
            await createFinancialAudit({ action: AuditAction.PAYMENT_AUTHORIZED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: authorized._id, financialContext: { domain: "PAYMENT", primaryReference: authorized.paymentReference, paymentReference: authorized.paymentReference, amount: authorized.amount, currency: authorized.currency, provider: authorized.provider, providerReference: authorized.providerPaymentId }, transition: { fromStatus: PaymentStatus.INITIALIZING, toStatus: PaymentStatus.AUTHORIZED, outcome: "PROCESSING" }, session });
            current = authorized;
          }
          if (current.status === PaymentStatus.AUTHORIZED) {
            const captured = await paymentRepository.transition(
              current._id,
              [PaymentStatus.AUTHORIZED],
              { status: PaymentStatus.CAPTURED, ...providerData },
              session,
            );
            if (!captured) throw new PaymentError("Payment capture transition conflicted.");
            await createFinancialAudit({ action: AuditAction.PAYMENT_CAPTURED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: captured._id, financialContext: { domain: "PAYMENT", primaryReference: captured.paymentReference, paymentReference: captured.paymentReference, amount: captured.amount, currency: captured.currency, provider: captured.provider, providerReference: captured.providerPaymentId }, transition: { fromStatus: PaymentStatus.AUTHORIZED, toStatus: PaymentStatus.CAPTURED, outcome: "SUCCEEDED" }, session });
            current = captured;
          }
        } else if (providerState.providerStatus === "AUTHORIZED" && current.status === PaymentStatus.INITIALIZING) {
          const authorized = await paymentRepository.transition(
            current._id,
            [PaymentStatus.INITIALIZING],
            { status: PaymentStatus.AUTHORIZED, ...providerData, authorizationId: providerData.providerTransactionId },
            session,
          );
          if (!authorized) throw new PaymentError("Payment authorization transition conflicted.");
          await createFinancialAudit({ action: AuditAction.PAYMENT_AUTHORIZED, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: authorized._id, financialContext: { domain: "PAYMENT", primaryReference: authorized.paymentReference, paymentReference: authorized.paymentReference, amount: authorized.amount, currency: authorized.currency, provider: authorized.provider, providerReference: authorized.providerPaymentId }, transition: { fromStatus: PaymentStatus.INITIALIZING, toStatus: PaymentStatus.AUTHORIZED, outcome: "PROCESSING" }, session });
          current = authorized;
        } else if (providerState.providerStatus !== "CAPTURED" && providerState.providerStatus !== "AUTHORIZED") {
          await createFinancialAudit({ action: AuditAction.PAYMENT_OUTCOME_UNKNOWN, actor: { type: "PROVIDER", reference: payment.provider }, entityType: "PAYMENT", entityId: current._id, financialContext: { domain: "PAYMENT", primaryReference: current.paymentReference, paymentReference: current.paymentReference, amount: current.amount, currency: current.currency, provider: current.provider, providerReference: current.providerPaymentId }, transition: { fromStatus: current.status, toStatus: current.status, outcome: "UNKNOWN" }, session });
          throw new PaymentError(`Provider status '${providerState.providerStatus}' cannot advance the Financial Payment.`);
        }
        if (current.status === PaymentStatus.CAPTURED) {
          await escrowRecognitionService.recognizeCapturedPayment(current, session);
        }
        payment = current;
      });
    } finally {
      await session.endSession();
    }

    return { payment, session: initialized.session };
  }

  /* ---------------------------------------------------------------------- */
  /* Payment Verification                                                   */
  /* ---------------------------------------------------------------------- */

  async verifyPayment(paymentId: string): Promise<IPayment> {
    const payment = await this.payments.getPayment(paymentId);

    if (!payment.providerPaymentId) {
      throw new PaymentError("Provider payment id has not been assigned.");
    }

    const provider = this.resolveProvider(payment.provider);

    const result = await provider.verifyPayment({
      providerPaymentId: payment.providerPaymentId,
    });

    if (!result.verified) {
      throw new PaymentError("Payment verification failed.");
    }

    if (result.payload) {
      await this.payments.updateProviderPayload(paymentId, result.payload);
    }

    if (result.providerTransactionId) {
      await this.payments.updateProviderReferences(paymentId, {
        providerTransactionId: result.providerTransactionId,
      });

      await this.payments.markAuthorized(
        paymentId,
        result.providerTransactionId,
      );
    } else {
      await this.payments.updateStatus(paymentId, PaymentStatus.AUTHORIZED);
    }

    return this.payments.getPayment(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Capture                                                                */
  /* ---------------------------------------------------------------------- */
  async capturePayment(paymentId: string): Promise<IPayment> {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [PaymentStatus.AUTHORIZED]);

    if (!payment.providerPaymentId) {
      throw new PaymentError("Provider payment id has not been assigned.");
    }

    const provider = this.resolveProvider(payment.provider);

    const providerStatus = await provider.getPaymentStatus({
      providerPaymentId: payment.providerPaymentId,
    });

    if (providerStatus.payload) {
      await this.payments.updateProviderPayload(
        paymentId,
        providerStatus.payload,
      );
    }

    if (providerStatus.providerTransactionId) {
      await this.payments.updateProviderReferences(paymentId, {
        providerTransactionId: providerStatus.providerTransactionId,
      });
    }

    switch (providerStatus.providerStatus) {
      case "AUTHORIZED": {
        const transactionId =
          providerStatus.providerTransactionId ??
          payment.providerTransactionId ??
          payment.authorizationId ??
          payment.providerPaymentId;

        await this.payments.markCaptured(paymentId, transactionId);

        break;
      }

      case "CAPTURED": {
        const transactionId =
          providerStatus.providerTransactionId ??
          payment.providerTransactionId ??
          payment.authorizationId ??
          payment.providerPaymentId;

        await this.payments.markCaptured(paymentId, transactionId);

        break;
      }

      case "SETTLED": {
        const transactionId =
          providerStatus.providerTransactionId ??
          payment.providerTransactionId ??
          payment.authorizationId ??
          payment.providerPaymentId;

        await this.payments.markCaptured(paymentId, transactionId);

        await this.payments.updateStatus(paymentId, PaymentStatus.SETTLED);

        break;
      }

      default:
        throw new PaymentError(
          `Provider payment cannot be captured from '${providerStatus.providerStatus}'.`,
        );
    }

    return this.payments.getPayment(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Synchronization                                                        */
  /* ---------------------------------------------------------------------- */
  async synchronizePayment(paymentId: string): Promise<IPayment> {
    const payment = await this.payments.getPayment(paymentId);

    if (!payment.providerPaymentId) {
      throw new PaymentError("Provider payment id has not been assigned.");
    }

    const provider = this.resolveProvider(payment.provider);

    const providerStatus = await provider.getPaymentStatus({
      providerPaymentId: payment.providerPaymentId,
    });

    if (providerStatus.payload) {
      await this.payments.updateProviderPayload(
        paymentId,
        providerStatus.payload,
      );
    }

    await this.payments.updateProviderReferences(paymentId, {
      providerPaymentId: providerStatus.providerPaymentId,
      providerTransactionId: providerStatus.providerTransactionId,
    });

    switch (providerStatus.providerStatus) {
      case "CREATED":
        await this.payments.updateStatus(paymentId, PaymentStatus.CREATED);
        break;

      case "INITIALIZING":
        await this.payments.updateStatus(paymentId, PaymentStatus.INITIALIZING);
        break;

      case "PENDING":
        await this.payments.updateStatus(paymentId, PaymentStatus.PENDING);
        break;

      case "AUTHORIZED":
        if (providerStatus.providerTransactionId) {
          await this.payments.markAuthorized(
            paymentId,
            providerStatus.providerTransactionId,
          );
        } else {
          await this.payments.updateStatus(paymentId, PaymentStatus.AUTHORIZED);
        }
        break;

      case "CAPTURED":
        await this.payments.markCaptured(
          paymentId,
          providerStatus.providerTransactionId ??
            payment.providerTransactionId ??
            payment.authorizationId ??
            payment.providerPaymentId,
        );
        break;

      case "SETTLED":
        await this.payments.updateStatus(paymentId, PaymentStatus.SETTLED);
        break;

      case "FAILED":
        await this.payments.markFailed(
          paymentId,
          PaymentFailureReason.PROVIDER_ERROR,
          "Provider reported payment failure.",
        );
        break;

      case "CANCELLED":
        await this.payments.markCancelled(paymentId);
        break;

      case "EXPIRED":
        await this.payments.updateStatus(paymentId, PaymentStatus.EXPIRED);
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
  async settlePayment(paymentId: string) {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [PaymentStatus.CAPTURED, PaymentStatus.SETTLED]);

    const existingSettlements = await this.settlements.getByPayment(
      payment._id.toString(),
    );

    let settlement =
      existingSettlements.length > 0 ? existingSettlements[0] : null;

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

    if (settlement.status === SettlementStatus.COMPLETED) {
      return settlement;
    }

    if (
      settlement.status === SettlementStatus.CREATED ||
      settlement.status === SettlementStatus.PENDING
    ) {
      await this.settlements.markProcessing(settlement._id.toString());
    }

    return this.settlements.getSettlement(settlement._id.toString());
  }

  /* ---------------------------------------------------------------------- */
  /* Ledger Posting                                                         */
  /* ---------------------------------------------------------------------- */
  async postSettlementLedger(paymentId: string): Promise<void> {
    const payment = await this.payments.getPayment(paymentId);

    const settlements = await this.settlements.getByPayment(paymentId);

    const settlement = settlements.length > 0 ? settlements[0] : null;

    if (!settlement) {
      throw new PaymentError("Settlement does not exist.");
    }

    const existingLedgerEntries = await this.ledger.getBySettlement(
      settlement._id.toString(),
    );

    const settlementLedgerExists = existingLedgerEntries.some(
      (entry) =>
        entry.paymentId?.toString() === payment._id.toString() &&
        entry.type === LedgerEntryType.SETTLEMENT &&
        entry.source === LedgerSource.SETTLEMENT,
    );

    if (settlementLedgerExists) {
      return;
    }

    await this.ledger.createCredit({
      bookingId: payment.bookingId.toString(),

      userId: payment.creatorId.toString(),

      paymentId: payment._id.toString(),

      settlementId: settlement._id.toString(),

      transactionId:
        payment.providerTransactionId ??
        payment.authorizationId ??
        payment.providerPaymentId ??
        payment.paymentReference,

      money: this.toMoney(payment),

      type: LedgerEntryType.SETTLEMENT,

      source: LedgerSource.SETTLEMENT,

      description: "Booking payment settled",
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Creator Balance                                                        */
  /* ---------------------------------------------------------------------- */
  async creditCreatorBalance(paymentId: string): Promise<void> {
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

  async completeSettlement(paymentId: string) {
    const payment = await this.payments.getPayment(paymentId);

    const settlements = await this.settlements.getByPayment(paymentId);

    const settlement = settlements.length > 0 ? settlements[0] : null;

    if (!settlement) {
      throw new PaymentError("Settlement not found.");
    }

    if (settlement.status === SettlementStatus.COMPLETED) {
      if (payment.status !== PaymentStatus.SETTLED) {
        await this.payments.markSettled(
          paymentId,
          settlement._id.toString(),
        );
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

      settlement: await this.settlements.getSettlement(
        settlement._id.toString(),
      ),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Funds Availability                                                     */
  /* ---------------------------------------------------------------------- */
  async releasePendingFunds(paymentId: string): Promise<{
    payment: IPayment;
    settlement: ISettlement;
  }> {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [PaymentStatus.SETTLED]);

    const session = await mongoose.startSession();
    let releasedSettlement: ISettlement | null = null;

    try {
      await session.withTransaction(async () => {
        const settlements = await this.settlements.getByPayment(
          paymentId,
          session,
        );

        const settlement = settlements.length > 0 ? settlements[0] : null;

        if (!settlement) {
          throw new PaymentError("Settlement not found.");
        }

        if (settlement.status !== SettlementStatus.COMPLETED) {
          throw new PaymentError("Settlement has not completed.");
        }

        if (this.isFundsReleased(settlement.attributes)) {
          releasedSettlement = settlement;
          return;
        }

        await this.balances.createBalance(
          {
            creatorId: payment.creatorId.toString(),
            currency: payment.currency,
          },
          session,
        );

        await this.balances.transferBalance(
          {
            creatorId: payment.creatorId.toString(),
            from: "pendingBalance",
            to: "availableBalance",
            money: this.toMoney(payment),
          },
          session,
        );

        const fundsRelease: FundsReleaseMarker = {
          status: "RELEASED",
          paymentId: payment._id.toString(),
          amount: payment.amount,
          currency: payment.currency,
          releasedAt: new Date(),
        };

        releasedSettlement = await this.settlements.updateAttributes(
          settlement._id.toString(),
          {
            ...(settlement.attributes ?? {}),
            fundsRelease,
          },
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    if (!releasedSettlement) {
      throw new PaymentError("Failed to release pending funds.");
    }

    return {
      payment,
      settlement: releasedSettlement,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Settlement Failure                                                     */
  /* ---------------------------------------------------------------------- */
  async failSettlement(paymentId: string, reason?: string): Promise<void> {
    const settlements = await this.settlements.getByPayment(paymentId);

    const settlement = settlements.length > 0 ? settlements[0] : null;

    if (!settlement) {
      throw new PaymentError("Settlement not found.");
    }

    if (settlement.status === SettlementStatus.FAILED) {
      return;
    }

    await this.settlements.markFailed(settlement._id.toString(), reason);
  }

  /* ---------------------------------------------------------------------- */
  /* Refund                                                                 */
  /* ---------------------------------------------------------------------- */
  async refundPayment(
    paymentId: string,
    amount?: Money,
    reason: RefundReason = RefundReason.OTHER,
  ) {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [
      PaymentStatus.CAPTURED,
      PaymentStatus.SETTLED,
      PaymentStatus.PARTIALLY_REFUNDED,
    ]);

    if (!payment.providerPaymentId) {
      throw new PaymentError("Provider payment id has not been assigned.");
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
      await this.refunds.updateProviderPayload(
        refund._id.toString(),
        providerRefund.payload,
      );
    }

    if (providerRefund.providerStatus === "COMPLETED") {
      await this.refunds.markCompleted(refund._id.toString());

      if (refundAmount.amount >= payment.amount) {
        await this.payments.markRefunded(paymentId);
      } else {
        await this.payments.updateStatus(
          paymentId,
          PaymentStatus.PARTIALLY_REFUNDED,
        );
      }
    }

    return this.refunds.getRefund(refund._id.toString());
  }

  /* ---------------------------------------------------------------------- */
  /* Cancellation                                                           */
  /* ---------------------------------------------------------------------- */

  async cancelPayment(paymentId: string): Promise<IPayment> {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [
      PaymentStatus.CREATED,
      PaymentStatus.INITIALIZING,
      PaymentStatus.PENDING,
      PaymentStatus.AUTHORIZED,
    ]);

    await this.payments.markCancelled(paymentId);

    return this.payments.getPayment(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Expiry                                                                 */
  /* ---------------------------------------------------------------------- */

  async expirePayment(paymentId: string): Promise<IPayment> {
    const payment = await this.payments.getPayment(paymentId);

    this.ensureStatus(payment, [
      PaymentStatus.CREATED,
      PaymentStatus.INITIALIZING,
      PaymentStatus.PENDING,
    ]);

    await this.payments.updateStatus(paymentId, PaymentStatus.EXPIRED);

    return this.payments.getPayment(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Integrity                                                              */
  /* ---------------------------------------------------------------------- */
  async verifyIntegrity(paymentId: string): Promise<boolean> {
    const payment = await this.payments.getPayment(paymentId);

    if (
      payment.status === PaymentStatus.AUTHORIZED &&
      !payment.authorizationId
    ) {
      return false;
    }

    if (
      payment.status === PaymentStatus.CAPTURED &&
      !payment.providerTransactionId
    ) {
      return false;
    }

    if (payment.status === PaymentStatus.SETTLED && !payment.settlementId) {
      return false;
    }

    return this.payments.verifyIntegrity(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Retry                                                                  */
  /* ---------------------------------------------------------------------- */

  async retryVerification(paymentId: string): Promise<IPayment> {
    return this.verifyPayment(paymentId);
  }

  async retrySynchronization(paymentId: string): Promise<IPayment> {
    return this.synchronizePayment(paymentId);
  }

  /** Explicit operations-layer entry point; delegates to the existing lifecycle synchronization. */
  async adminSynchronizePayment(paymentId: string): Promise<IPayment> {
    return this.retrySynchronization(paymentId);
  }

  /* ---------------------------------------------------------------------- */
  /* Lookup                                                                 */
  /* ---------------------------------------------------------------------- */

  async getPayment(paymentId: string): Promise<IPayment> {
    return this.payments.getPayment(paymentId);
  }

  async paymentExists(paymentId: string): Promise<boolean> {
    return this.payments.exists(paymentId);
  }
}

export const paymentLifecycleService = new PaymentLifecycleService();
