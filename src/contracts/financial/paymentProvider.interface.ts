// backend/src/contracts/financial/paymentProvider.interface.ts

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { ProviderRoutingCapabilityProfile } from "./providerRouting.types";

import {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  CancelPaymentRequest,
  CancelPaymentResponse,
  CreateRefundRequest,
  CreateRefundResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
  TerminationEvidenceRequest,
  TerminationEvidence,
} from "./paymentProvider.types";

/**
 * Generic payment provider contract.
 *
 * The Financial Domain depends only on this interface.
 * Provider adapters translate provider-specific APIs into these
 * normalized operations.
 */
export interface PaymentProviderInterface {
  /**
   * Provider identifier.
   */
  readonly provider: PaymentProvider;

  /** Explicit adapter guarantees for future disposition refunds; absent means unsupported. */
  readonly dispositionRefundCapabilities?: { fullRefund: boolean; partialRefund: boolean; idempotent: boolean; authenticatedLookup: boolean };
  /** Static, approved capability evidence for routing only; absence is unknown. */
  readonly routingCapabilityProfile?: ProviderRoutingCapabilityProfile;

  /**
   * Creates a provider payment session/order.
   */
  createPaymentSession(
    request: CreatePaymentSessionRequest,
  ): Promise<CreatePaymentSessionResponse>;

  /**
   * Verifies that a payment completed successfully.
   *
   * This may perform signature verification,
   * payment lookup,
   * authorization validation,
   * or provider-specific confirmation.
   */
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;

  /**
   * Retrieves the latest payment status.
   */
  getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<GetPaymentStatusResponse>;

  cancelPayment(request: CancelPaymentRequest): Promise<CancelPaymentResponse>;

  /**
   * Creates a refund.
   */
  createRefund(request: CreateRefundRequest): Promise<CreateRefundResponse>;

  /** Read-only authenticated evidence; absent capability means unsupported. */
  getTerminationEvidence?(request: TerminationEvidenceRequest): Promise<TerminationEvidence>;

  /**
   * Verifies and normalizes incoming webhooks.
   */
  verifyWebhook(request: VerifyWebhookRequest): Promise<VerifyWebhookResponse>;
}
