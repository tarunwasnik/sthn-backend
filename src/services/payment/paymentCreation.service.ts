// backend/src/services/payment/paymentCreation.service.ts

import { randomUUID } from "crypto";
import { Types } from "mongoose";

import { paymentRepository } from "../../repositories/payment.repository";
import { IPayment } from "../../models/payment.model";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentFailureReason } from "../../enums/financial/paymentFailureReason.enum";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { paymentService } from "../financial/payment.service";

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Payment Creation Service
 * ============================================================
 *
 * Responsibility
 * --------------
 * Creates Payment records.
 *
 * IMPORTANT
 * ---------
 * - Does NOT process payments.
 * - Does NOT communicate with payment providers.
 * - Does NOT update Wallets.
 * - Does NOT create Ledger entries.
 * ============================================================
 */

export interface CreatePaymentInput {
  bookingId: Types.ObjectId;

  userId: Types.ObjectId;

  creatorId: Types.ObjectId;

  /** Authoritative service amount; gross provider amount is Financial-domain derived. */
  serviceAmount: number;

  currency: SupportedCurrency;

  provider?: PaymentProvider;

  method?: PaymentMethod;

  idempotencyKey?: string;
}

export class PaymentCreationService {
  /**
   * Creates a new Payment.
   */
  async createPayment(input: CreatePaymentInput): Promise<IPayment> {
    const idempotencyKey = input.idempotencyKey ?? randomUUID();

    const existing =
      await paymentRepository.findByIdempotencyKey(idempotencyKey);

    if (existing) {
      return existing;
    }

    return paymentService.createPayment({
      bookingId: input.bookingId.toString(),
      userId: input.userId.toString(),
      creatorId: input.creatorId.toString(),
      serviceAmount: { amount: input.serviceAmount, currency: input.currency },
      provider: input.provider ?? PaymentProvider.INTERNAL,
      method: input.method ?? PaymentMethod.INTERNAL,
      idempotencyKey,
    });
  }
}

export const paymentCreationService = new PaymentCreationService();
