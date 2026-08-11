import mongoose, { ClientSession, Types, UpdateQuery } from "mongoose";

import InternalPaymentRepository from "../../../repositories/internalProvider/internalPayment.repository";

import {
  ProviderEntityType,
  ProviderEventType,
  ProviderOperation,
  ProviderStatus,
  ProviderFailureReason,
} from "../../../constants/internalProvider";

import { InternalPaymentDocument } from "../../../models/internalProvider/internalPayment.model";

import ProviderClockService from "../base/providerClock.service";
import ProviderEventService from "../events/providerEvent.service";
import { ProviderSimulatorError } from "../../../errors/internalProvider/ProviderSimulatorError";

interface PaymentTransition {
  targetStatus: ProviderStatus;
  allowedStatuses: ProviderStatus[];
  eventType: ProviderEventType;
  operation: ProviderOperation;
  update: UpdateQuery<InternalPaymentDocument>;
  assertReplay?: (current: InternalPaymentDocument) => void;
}

/**
 * Owns Internal Provider payment execution state. Financial Payment state is
 * deliberately advanced by the Financial Domain lifecycle, never here.
 */
export class ProviderPaymentService {
  private transitionKey(
    payment: InternalPaymentDocument,
    operation: ProviderOperation,
  ): string {
    return `internal-payment:${payment.providerPaymentId}:${operation}`;
  }

  private assertOptionalTransactionIdReplay(
    current: InternalPaymentDocument,
    incomingTransactionId: string | undefined,
  ): void {
    const existingTransactionId = current.providerTransactionId ?? undefined;

    if (existingTransactionId !== incomingTransactionId) {
      throw new ProviderSimulatorError(
        "Provider payment authorization replay has a different transaction identifier.",
        "PROVIDER_PAYMENT_REPLAY_CONFLICT",
        409,
      );
    }
  }

  private assertFailureReasonReplay(
    current: InternalPaymentDocument,
    incomingReason: ProviderFailureReason,
  ): void {
    if (current.failureReason !== incomingReason) {
      throw new ProviderSimulatorError(
        "Provider payment failure replay has a different failure reason.",
        "PROVIDER_PAYMENT_REPLAY_CONFLICT",
        409,
      );
    }
  }

  private async recordPaymentEvent(
    payment: InternalPaymentDocument,
    eventType: ProviderEventType,
    operation: ProviderOperation,
    session: ClientSession,
  ): Promise<void> {
    await ProviderEventService.recordEvent({
      entityType: ProviderEntityType.PAYMENT,
      entityId: payment._id as Types.ObjectId,
      eventType,
      operation,
      transitionKey: this.transitionKey(payment, operation),
      providerEntityId: payment.providerPaymentId,
      providerPaymentId: payment.providerPaymentId,
      providerReference: payment.providerReference ?? undefined,
      providerMetadata: payment.providerMetadata,
      execution: payment.execution,
      audit: payment.audit,
      payloads: payment.payloads,
    }, session);
  }

  /** Creates the provider record and its CREATED event atomically. */
  async createPayment(
    data: Partial<InternalPaymentDocument>,
  ): Promise<InternalPaymentDocument> {
    const session = await mongoose.startSession();
    let created: InternalPaymentDocument | null = null;

    try {
      await session.withTransaction(async () => {
        const payment = await InternalPaymentRepository.create({
          ...data,
          status: ProviderStatus.CREATED,
          isTerminal: false,
        }, session);

        await this.recordPaymentEvent(
          payment,
          ProviderEventType.PAYMENT_CREATED,
          ProviderOperation.CREATE_PAYMENT,
          session,
        );
        created = payment;
      });
    } finally {
      await session.endSession();
    }

    if (!created) {
      throw new ProviderSimulatorError(
        "Provider payment creation did not complete.",
        "PROVIDER_PAYMENT_CREATE_FAILED",
        500,
      );
    }

    return created;
  }

  /**
   * Commits one legal provider transition with its immutable event. Replays of
   * the same target state are successful no-ops and emit no second event.
   */
  private async executeTransition(
    paymentId: Types.ObjectId | string,
    transition: PaymentTransition,
  ): Promise<InternalPaymentDocument> {
    const session = await mongoose.startSession();
    let result: InternalPaymentDocument | null = null;

    try {
      await session.withTransaction(async () => {
        const current = await InternalPaymentRepository.findById(paymentId, session);

        if (!current) {
          throw new ProviderSimulatorError(
            "Internal Provider payment not found.",
            "PROVIDER_PAYMENT_NOT_FOUND",
            404,
          );
        }

        if (current.status === transition.targetStatus) {
          transition.assertReplay?.(current);
          result = current;
          return;
        }

        if (current.isTerminal) {
          throw new ProviderSimulatorError(
            `Cannot apply ${transition.operation} to terminal provider payment ${current.status}.`,
            "PROVIDER_PAYMENT_TERMINAL_CONFLICT",
            409,
          );
        }

        const payment = await InternalPaymentRepository.updateOne(
          {
            _id: current._id,
            status: { $in: transition.allowedStatuses },
            isTerminal: false,
          },
          transition.update,
          session,
        );

        if (!payment) {
          throw new ProviderSimulatorError(
            "Provider payment state changed concurrently. Retry the provider operation.",
            "PROVIDER_PAYMENT_TRANSITION_CONFLICT",
            409,
          );
        }

        await this.recordPaymentEvent(
          payment,
          transition.eventType,
          transition.operation,
          session,
        );
        result = payment;
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      throw new ProviderSimulatorError(
        "Provider payment transition did not complete.",
        "PROVIDER_PAYMENT_TRANSITION_FAILED",
        500,
      );
    }

    return result;
  }

  async authorizePayment(
    paymentId: Types.ObjectId | string,
    providerTransactionId?: string,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.AUTHORIZED,
      allowedStatuses: [ProviderStatus.CREATED],
      eventType: ProviderEventType.PAYMENT_AUTHORIZED,
      operation: ProviderOperation.AUTHORIZE_PAYMENT,
      update: {
        status: ProviderStatus.AUTHORIZED,
        ...(providerTransactionId ? { providerTransactionId } : {}),
        authorizedAt: now,
        "audit.lastStatusChangedAt": now,
      },
      assertReplay: (current) =>
        this.assertOptionalTransactionIdReplay(current, providerTransactionId),
    });
  }

  async capturePayment(
    paymentId: Types.ObjectId | string,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.CAPTURED,
      allowedStatuses: [ProviderStatus.AUTHORIZED, ProviderStatus.PARTIALLY_CAPTURED],
      eventType: ProviderEventType.PAYMENT_CAPTURED,
      operation: ProviderOperation.CAPTURE_PAYMENT,
      update: {
        status: ProviderStatus.CAPTURED,
        isTerminal: true,
        capturedAt: now,
        "audit.lastStatusChangedAt": now,
      },
    });
  }

  async partiallyCapturePayment(
    paymentId: Types.ObjectId | string,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.PARTIALLY_CAPTURED,
      allowedStatuses: [ProviderStatus.AUTHORIZED],
      eventType: ProviderEventType.PAYMENT_PARTIALLY_CAPTURED,
      operation: ProviderOperation.PARTIAL_CAPTURE_PAYMENT,
      update: {
        status: ProviderStatus.PARTIALLY_CAPTURED,
        "audit.lastStatusChangedAt": now,
      },
    });
  }

  async cancelPayment(
    paymentId: Types.ObjectId | string,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.CANCELLED,
      allowedStatuses: [ProviderStatus.CREATED, ProviderStatus.AUTHORIZED, ProviderStatus.PARTIALLY_CAPTURED],
      eventType: ProviderEventType.PAYMENT_CANCELLED,
      operation: ProviderOperation.CANCEL_PAYMENT,
      update: {
        status: ProviderStatus.CANCELLED,
        isTerminal: true,
        cancelledAt: now,
        "audit.lastStatusChangedAt": now,
      },
    });
  }

  async failPayment(
    paymentId: Types.ObjectId | string,
    reason: ProviderFailureReason,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.FAILED,
      allowedStatuses: [ProviderStatus.CREATED, ProviderStatus.AUTHORIZED, ProviderStatus.PARTIALLY_CAPTURED],
      eventType: ProviderEventType.PAYMENT_FAILED,
      operation: ProviderOperation.FAIL_PAYMENT,
      update: {
        status: ProviderStatus.FAILED,
        failureReason: reason,
        isTerminal: true,
        failedAt: now,
        "audit.lastStatusChangedAt": now,
      },
      assertReplay: (current) =>
        this.assertFailureReasonReplay(current, reason),
    });
  }

  async expirePayment(
    paymentId: Types.ObjectId | string,
  ): Promise<InternalPaymentDocument> {
    const now = ProviderClockService.now();
    return this.executeTransition(paymentId, {
      targetStatus: ProviderStatus.EXPIRED,
      allowedStatuses: [ProviderStatus.CREATED, ProviderStatus.AUTHORIZED, ProviderStatus.PARTIALLY_CAPTURED],
      eventType: ProviderEventType.PAYMENT_EXPIRED,
      operation: ProviderOperation.EXPIRE_PAYMENT,
      update: {
        status: ProviderStatus.EXPIRED,
        isTerminal: true,
        expiredAt: now,
        "audit.lastStatusChangedAt": now,
      },
    });
  }

  async findById(paymentId: Types.ObjectId | string): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findById(paymentId);
  }

  async findByPaymentId(paymentId: Types.ObjectId): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findByPaymentId(paymentId);
  }

  async findByProviderPaymentId(providerPaymentId: string): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findByProviderPaymentId(providerPaymentId);
  }

  async findByProviderTransactionId(providerTransactionId: string): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findByProviderTransactionId(providerTransactionId);
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findByIdempotencyKey(idempotencyKey);
  }

  async findByIdempotencyKeyForReplay(idempotencyKey: string): Promise<InternalPaymentDocument | null> {
    return InternalPaymentRepository.findByIdempotencyKeyForReplay(idempotencyKey);
  }
}

export default new ProviderPaymentService();
