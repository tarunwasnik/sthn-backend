import crypto from "crypto";

import { PaymentProviderInterface } from "../../../contracts/financial/paymentProvider.interface";
import {
  CancelPaymentRequest,
  CancelPaymentResponse,
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
  CreateRefundRequest,
  CreateRefundResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  TerminationEvidence,
  TerminationEvidenceRequest,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  VerifyWebhookRequest,
  VerifyWebhookResponse,
} from "../../../contracts/financial/paymentProvider.types";
import { PaymentProvider } from "../../../enums/financial/paymentProvider.enum";
import { PaymentError } from "../../../errors/financial/PaymentError";

type RazorpayObject = Record<string, unknown>;
export interface RazorpaySandboxConfiguration { keyId: string; keySecret: string; webhookSecret: string; }
export interface RazorpayHttpRequest { method: "GET" | "POST"; path: string; body?: RazorpayObject; authorization: string; }
export interface RazorpayHttpResponse { status: number; body: RazorpayObject; }
export type RazorpayHttpClient = (request: RazorpayHttpRequest) => Promise<RazorpayHttpResponse>;

/** Default server-only transport. Tests inject a deterministic replacement. */
export const razorpaySandboxFetchClient: RazorpayHttpClient = async (request) => {
  const response = await fetch(`https://api.razorpay.com${request.path}`, {
    method: request.method,
    headers: { authorization: request.authorization, ...(request.body ? { "content-type": "application/json" } : {}) },
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
  });
  const text = await response.text();
  let body: RazorpayObject = {};
  try { body = object(text ? JSON.parse(text) : {}); } catch { body = {}; }
  return { status: response.status, body };
};

const INR = "INR";
const object = (value: unknown): RazorpayObject => typeof value === "object" && value !== null && !Array.isArray(value) ? value as RazorpayObject : {};
const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

/**
 * Validates only sandbox credentials. This phase deliberately has no live-key
 * fallback: a live key or production process makes the adapter unavailable.
 */
export function razorpaySandboxConfigurationFromEnvironment(env: NodeJS.ProcessEnv = process.env): RazorpaySandboxConfiguration | undefined {
  const values = [env.RAZORPAY_TEST_KEY_ID, env.RAZORPAY_TEST_KEY_SECRET, env.RAZORPAY_TEST_WEBHOOK_SECRET];
  if (values.every((value) => !value)) return undefined;
  if (env.NODE_ENV === "production" || values.some((value) => !value || !value.trim()) || !env.RAZORPAY_TEST_KEY_ID!.startsWith("rzp_test_")) {
    throw new PaymentError("Razorpay sandbox configuration is invalid or unavailable in production.", "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return { keyId: env.RAZORPAY_TEST_KEY_ID!, keySecret: env.RAZORPAY_TEST_KEY_SECRET!, webhookSecret: env.RAZORPAY_TEST_WEBHOOK_SECRET! };
}
/** A deliberately injected transport keeps unit tests deterministic and avoids SDK-specific state. */
export class RazorpaySandboxPaymentProvider implements PaymentProviderInterface {
  readonly provider = PaymentProvider.RAZORPAY;
  readonly dispositionRefundCapabilities = { fullRefund: true, partialRefund: true, idempotent: true, authenticatedLookup: true } as const;
  readonly routingCapabilityProfile = {
    configurationVersion: "razorpay-sandbox-v1", approvedEnvironments: ["test", "development"],
    operations: { COLLECTION: "SUPPORTED", PAYMENT_RECONCILIATION: "SUPPORTED", FULL_REFUND: "SUPPORTED", PARTIAL_REFUND: "SUPPORTED", REFUND_RECONCILIATION: "SUPPORTED", PAYOUT: "UNSUPPORTED", PAYOUT_RECONCILIATION: "UNSUPPORTED", FX: "UNSUPPORTED" },
    sourceCountries: ["IN"], destinationCountries: [], sourceCurrencies: [INR], destinationCurrencies: [],
    fundingRoutes: [], feeEvidenceReference: "razorpay-sandbox-v1", healthyOperations: ["COLLECTION", "PAYMENT_RECONCILIATION", "FULL_REFUND", "PARTIAL_REFUND", "REFUND_RECONCILIATION"],
  } as const;

  constructor(private readonly configuration: RazorpaySandboxConfiguration, private readonly http: RazorpayHttpClient) {
    if (!configuration.keyId.startsWith("rzp_test_") || !configuration.keySecret || !configuration.webhookSecret || process.env.NODE_ENV === "production") throw new PaymentError("Razorpay sandbox configuration is unavailable.", "PAYMENT_PROVIDER_UNAVAILABLE");
  }

  private authorization() { return `Basic ${Buffer.from(`${this.configuration.keyId}:${this.configuration.keySecret}`).toString("base64")}`; }
  private async request(method: "GET" | "POST", path: string, body?: RazorpayObject) {
    const response = await this.http({ method, path, body, authorization: this.authorization() });
    if (response.status < 200 || response.status >= 300) throw new PaymentError("Razorpay sandbox request was not accepted.", "PAYMENT_PROVIDER_OUTCOME_UNKNOWN");
    return object(response.body);
  }
  private assertInr(amount: { amount: number; currency: string }) { if (!Number.isSafeInteger(amount.amount) || amount.amount <= 0 || amount.currency !== INR) throw new PaymentError("Razorpay sandbox supports positive INR amounts only.", "PAYMENT_PROVIDER_UNAVAILABLE"); }
  private mapPaymentStatus(status: string | undefined): string {
    if (status === "captured") return "CAPTURED";
    if (status === "authorized") return "AUTHORIZED";
    if (status === "failed") return "FAILED";
    if (status === "refunded") return "REFUNDED";
    if (status === "created" || status === "attempted") return "PENDING";
    return "UNKNOWN";
  }
  private timingSafeEquals(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && crypto.timingSafeEqual(a, b); }

  async createPaymentSession(request: CreatePaymentSessionRequest): Promise<CreatePaymentSessionResponse> {
    this.assertInr(request.amount);
    if (request.provider !== PaymentProvider.RAZORPAY) throw new PaymentError("Razorpay provider identity is required.", "PAYMENT_PROVIDER_LINK_CONFLICT");
    const order = await this.request("POST", "/v1/orders", { amount: request.amount.amount, currency: INR, receipt: request.paymentReference, notes: { sths_payment_id: request.paymentId, sths_booking_id: request.bookingId, sths_idempotency_key: request.idempotencyKey } });
    const orderId = string(order.id); if (!orderId?.startsWith("order_") || number(order.amount) !== request.amount.amount || order.currency !== INR) throw new PaymentError("Razorpay order response does not match the payment request.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    // Razorpay creates pay_* only after checkout. order_* is the durable session identity.
    return { providerPaymentId: orderId, providerOrderId: orderId, payload: { provider: PaymentProvider.RAZORPAY, razorpayOrderId: orderId, status: "PENDING", checkoutMode: "TEST" } };
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    const paymentId = request.providerPaymentId; const orderId = request.providerOrderId;
    if (!paymentId.startsWith("pay_") || !orderId?.startsWith("order_") || !request.providerSignature) return { verified: false, providerStatus: "INVALID_CONFIRMATION" };
    const expected = crypto.createHmac("sha256", this.configuration.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    if (!this.timingSafeEquals(expected, request.providerSignature)) return { verified: false, providerStatus: "INVALID_SIGNATURE" };
    const payment = await this.request("GET", `/v1/payments/${encodeURIComponent(paymentId)}`);
    if (payment.order_id !== orderId || payment.currency !== INR || !number(payment.amount)) return { verified: false, providerStatus: "IDENTITY_MISMATCH" };
    return { verified: payment.status === "captured", providerTransactionId: paymentId, providerStatus: this.mapPaymentStatus(string(payment.status)), payload: { razorpayOrderId: orderId, amount: payment.amount, currency: payment.currency } };
  }

  async getPaymentStatus(request: GetPaymentStatusRequest): Promise<GetPaymentStatusResponse> {
    // A session order is not capture evidence: only a pay_* lookup can confirm funds.
    if (request.providerPaymentId.startsWith("order_")) return { providerPaymentId: request.providerPaymentId, providerStatus: "PENDING", payload: { razorpayOrderId: request.providerPaymentId, awaitingPaymentReference: true } };
    if (!request.providerPaymentId.startsWith("pay_")) throw new PaymentError("Invalid Razorpay payment reference.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    const payment = await this.request("GET", `/v1/payments/${encodeURIComponent(request.providerPaymentId)}`);
    const amount = number(payment.amount); if (payment.id !== request.providerPaymentId || payment.currency !== INR || amount === undefined) throw new PaymentError("Razorpay payment evidence is invalid.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    return { providerPaymentId: request.providerPaymentId, providerTransactionId: request.providerPaymentId, providerStatus: this.mapPaymentStatus(string(payment.status)), amount: { amount, currency: INR }, payload: { razorpayOrderId: payment.order_id } };
  }

  async cancelPayment(request: CancelPaymentRequest): Promise<CancelPaymentResponse> { return { providerPaymentId: request.providerPaymentId, providerStatus: "UNSUPPORTED", payload: { reason: "Razorpay order cancellation is not a supported financial mutation in this adapter." } }; }

  async createRefund(request: CreateRefundRequest): Promise<CreateRefundResponse> {
    this.assertInr(request.amount); if (!request.providerPaymentId.startsWith("pay_")) throw new PaymentError("Razorpay refunds require the original pay_* reference.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    const refund = await this.request("POST", `/v1/payments/${encodeURIComponent(request.providerPaymentId)}/refund`, { amount: request.amount.amount, notes: { sths_refund_id: request.refundId, sths_refund_reference: request.refundReference, sths_idempotency_key: request.idempotencyKey } });
    const refundId = string(refund.id); if (!refundId?.startsWith("rfnd_") || refund.payment_id !== request.providerPaymentId || refund.currency !== INR || number(refund.amount) !== request.amount.amount) throw new PaymentError("Razorpay refund response does not match the authorized refund.", "PAYMENT_PROVIDER_REFERENCE_MISMATCH");
    return { providerRefundId: refundId, providerStatus: refund.status === "processed" ? "COMPLETED" : "PENDING", payload: { razorpayPaymentId: request.providerPaymentId, razorpayRefundStatus: refund.status } };
  }

  async getTerminationEvidence(request: TerminationEvidenceRequest): Promise<TerminationEvidence> {
    if (request.kind === "PAYMENT" && request.providerPaymentId.startsWith("order_")) {
      return { outcome: "VERIFIED", kind: "PAYMENT", paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: "PENDING", result: "PENDING" };
    }
    if (request.kind !== "REFUND" || !request.providerOperationReference?.startsWith("rfnd_") || !request.refundId) return { outcome: "UNSUPPORTED" };
    const refund = await this.request("GET", `/v1/refunds/${encodeURIComponent(request.providerOperationReference)}`);
    if (refund.id !== request.providerOperationReference || refund.payment_id !== request.providerPaymentId || refund.amount !== request.amount.amount || refund.currency !== INR) return { outcome: "IDENTITY_MISMATCH" };
    const status = string(refund.status) ?? "unknown";
    if (status === "processed") return { outcome: "VERIFIED", kind: "REFUND", paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: status, result: "SUCCESS", refundId: request.refundId, providerOperationReference: request.providerOperationReference };
    if (status === "failed") return { outcome: "VERIFIED", kind: "REFUND", paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: status, result: "DEFINITIVE_FAILURE", refundId: request.refundId, providerOperationReference: request.providerOperationReference };
    return { outcome: "VERIFIED", kind: "REFUND", paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: status, result: "PENDING", refundId: request.refundId, providerOperationReference: request.providerOperationReference };
  }

  async verifyWebhook(request: VerifyWebhookRequest): Promise<VerifyWebhookResponse> {
    const signature = request.signature ?? string(request.headers["x-razorpay-signature"]);
    const raw = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : typeof request.body === "string" ? request.body : undefined;
    if (!signature || raw === undefined) return { verified: false, providerEventId: "", providerEventType: "INVALID_WEBHOOK", payload: {} };
    const expected = crypto.createHmac("sha256", this.configuration.webhookSecret).update(raw).digest("hex");
    if (!this.timingSafeEquals(expected, signature)) return { verified: false, providerEventId: "", providerEventType: "INVALID_SIGNATURE", payload: {} };
    let body: RazorpayObject;
    try { body = object(JSON.parse(raw)); } catch { return { verified: false, providerEventId: "", providerEventType: "INVALID_WEBHOOK", payload: {} }; }
    const event = string(body.event); const payload = object(body.payload); const entity = object(object(payload.payment).entity ?? object(payload.refund).entity); const id = string(entity.id);
    return { verified: !!event && !!id, providerEventId: id ?? "", providerEventType: event ?? "INVALID_WEBHOOK", payload: body };
  }
}
