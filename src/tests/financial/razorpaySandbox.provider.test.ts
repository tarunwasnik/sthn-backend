import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { RazorpayHttpRequest, RazorpaySandboxPaymentProvider, razorpaySandboxConfigurationFromEnvironment } from "../../services/financial/providers/razorpaySandbox.provider";
import { CreatePaymentSessionRequest } from "../../contracts/financial/paymentProvider.types";

const config = { keyId: "rzp_test_STHN", keySecret: "test-secret", webhookSecret: "webhook-secret" };
const session: CreatePaymentSessionRequest = { paymentId: "payment-1", paymentReference: "PAYMENT-1", bookingId: "booking-1", userId: "customer-1", creatorId: "creator-1", amount: { amount: 10500, currency: "INR" }, provider: PaymentProvider.RAZORPAY, method: "CARD" as any, idempotencyKey: "idem-1" };
const adapter = (handler: (request: RazorpayHttpRequest) => { status: number; body: Record<string, unknown> }) => new RazorpaySandboxPaymentProvider(config, async (request) => handler(request));
const signature = (orderId: string, paymentId: string) => crypto.createHmac("sha256", config.keySecret).update(`${orderId}|${paymentId}`).digest("hex");

test("Razorpay sandbox: creates an INR order with durable STHN identity notes", async () => {
  let request: RazorpayHttpRequest | undefined;
  const provider = adapter((value) => { request = value; return { status: 200, body: { id: "order_test1", amount: 10500, currency: "INR", status: "created" } }; });
  const result = await provider.createPaymentSession(session);
  assert.equal(result.providerPaymentId, "order_test1"); assert.equal(result.providerOrderId, "order_test1");
  assert.equal(request!.method, "POST"); assert.equal(request!.path, "/v1/orders"); assert.equal(request!.body!.amount, 10500); assert.equal(request!.body!.currency, "INR");
  assert.match(request!.authorization, /^Basic /); assert.deepEqual(request!.body!.notes, { sths_payment_id: "payment-1", sths_booking_id: "booking-1", sths_idempotency_key: "idem-1" });
});

test("Razorpay sandbox: rejects non-INR, malformed order evidence, missing credentials, and production configuration", async () => {
  const provider = adapter(() => ({ status: 200, body: { id: "order_test1", amount: 10500, currency: "INR" } }));
  await assert.rejects(() => provider.createPaymentSession({ ...session, amount: { amount: 10, currency: "USD" } }), /INR/);
  const mismatch = adapter(() => ({ status: 200, body: { id: "order_test1", amount: 10499, currency: "INR" } }));
  await assert.rejects(() => mismatch.createPaymentSession(session), /does not match/);
  assert.throws(() => new RazorpaySandboxPaymentProvider({ ...config, keyId: "rzp_live_not_allowed" }, async () => ({ status: 200, body: {} })), /unavailable/);
  assert.equal(razorpaySandboxConfigurationFromEnvironment({}), undefined);
  assert.throws(() => razorpaySandboxConfigurationFromEnvironment({ NODE_ENV: "production", RAZORPAY_TEST_KEY_ID: "rzp_test_x", RAZORPAY_TEST_KEY_SECRET: "x", RAZORPAY_TEST_WEBHOOK_SECRET: "x" }), /unavailable/);
});

test("Razorpay sandbox: verifies only a signed captured pay_* tied to its order", async () => {
  const provider = adapter((request) => ({ status: 200, body: { id: "pay_test1", order_id: "order_test1", amount: 10500, currency: "INR", status: "captured", requestedPath: request.path } }));
  const result = await provider.verifyPayment({ providerPaymentId: "pay_test1", providerOrderId: "order_test1", providerSignature: signature("order_test1", "pay_test1") });
  assert.equal(result.verified, true); assert.equal(result.providerStatus, "CAPTURED");
  const wrongSignature = await provider.verifyPayment({ providerPaymentId: "pay_test1", providerOrderId: "order_test1", providerSignature: "bad" });
  assert.equal(wrongSignature.verified, false);
  const wrongOrder = adapter(() => ({ status: 200, body: { id: "pay_test1", order_id: "order_other", amount: 10500, currency: "INR", status: "captured" } }));
  assert.equal((await wrongOrder.verifyPayment({ providerPaymentId: "pay_test1", providerOrderId: "order_test1", providerSignature: signature("order_test1", "pay_test1") })).verified, false);
});

test("Razorpay sandbox: distinguishes pending order sessions, captured, authorized, failed, and invalid payment evidence", async () => {
  const provider = adapter(() => ({ status: 200, body: { id: "pay_test1", amount: 10500, currency: "INR", status: "authorized" } }));
  assert.equal((await provider.getPaymentStatus({ providerPaymentId: "order_test1" })).providerStatus, "PENDING");
  assert.equal((await provider.getPaymentStatus({ providerPaymentId: "pay_test1" })).providerStatus, "AUTHORIZED");
  const failed = adapter(() => ({ status: 200, body: { id: "pay_test1", amount: 10500, currency: "INR", status: "failed" } }));
  assert.equal((await failed.getPaymentStatus({ providerPaymentId: "pay_test1" })).providerStatus, "FAILED");
  const wrongCurrency = adapter(() => ({ status: 200, body: { id: "pay_test1", amount: 10500, currency: "USD", status: "captured" } }));
  await assert.rejects(() => wrongCurrency.getPaymentStatus({ providerPaymentId: "pay_test1" }), /invalid/);
});

test("Razorpay sandbox: maps full and partial refund requests without claiming completion until processed", async () => {
  const requests: RazorpayHttpRequest[] = [];
  const provider = adapter((request) => { requests.push(request); return { status: 200, body: { id: "rfnd_test1", payment_id: "pay_test1", amount: request.body!.amount, currency: "INR", status: "pending" } }; });
  const partial = await provider.createRefund({ refundId: "refund-1", bookingId: "booking-1", refundReference: "REFUND-1", paymentReference: "PAYMENT-1", providerPaymentId: "pay_test1", amount: { amount: 1000, currency: "INR" }, idempotencyKey: "refund-idem" });
  assert.equal(partial.providerStatus, "PENDING"); assert.equal(requests[0].path, "/v1/payments/pay_test1/refund"); assert.equal(requests[0].body!.amount, 1000);
  await assert.rejects(() => provider.createRefund({ refundId: "refund-2", bookingId: "booking-1", refundReference: "REFUND-2", paymentReference: "PAYMENT-1", providerPaymentId: "order_test1", amount: { amount: 10500, currency: "INR" }, idempotencyKey: "refund-idem-2" }), /pay_\*/);
});

test("Razorpay sandbox: refund lookup authenticates success, failure, and pending outcomes", async () => {
  const provider = adapter(() => ({ status: 200, body: { id: "rfnd_test1", payment_id: "pay_test1", amount: 1000, currency: "INR", status: "processed" } }));
  const evidence = await provider.getTerminationEvidence({ kind: "REFUND", paymentId: "payment-1", providerPaymentId: "pay_test1", amount: { amount: 1000, currency: "INR" }, refundId: "refund-1", providerOperationReference: "rfnd_test1" });
  assert.equal(evidence.outcome, "VERIFIED"); if (evidence.outcome === "VERIFIED") assert.equal(evidence.result, "SUCCESS");
  const failed = adapter(() => ({ status: 200, body: { id: "rfnd_test1", payment_id: "pay_test1", amount: 1000, currency: "INR", status: "failed" } }));
  const failedEvidence = await failed.getTerminationEvidence({ kind: "REFUND", paymentId: "payment-1", providerPaymentId: "pay_test1", amount: { amount: 1000, currency: "INR" }, refundId: "refund-1", providerOperationReference: "rfnd_test1" });
  assert.equal(failedEvidence.outcome, "VERIFIED"); if (failedEvidence.outcome === "VERIFIED") assert.equal(failedEvidence.result, "DEFINITIVE_FAILURE");
});

test("Razorpay sandbox: verifies raw webhook bytes and rejects invalid or parsed bodies", async () => {
  const provider = adapter(() => ({ status: 500, body: {} }));
  const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_test1" } } } });
  const webhook = await provider.verifyWebhook({ headers: {}, body: raw, signature: crypto.createHmac("sha256", config.webhookSecret).update(raw).digest("hex") });
  assert.equal(webhook.verified, true); assert.equal(webhook.providerEventId, "pay_test1");
  assert.equal((await provider.verifyWebhook({ headers: {}, body: raw, signature: "bad" })).verified, false);
  assert.equal((await provider.verifyWebhook({ headers: {}, body: JSON.parse(raw), signature: "bad" })).verified, false);
  const malformed = "{";
  assert.equal((await provider.verifyWebhook({ headers: {}, body: malformed, signature: crypto.createHmac("sha256", config.webhookSecret).update(malformed).digest("hex") })).verified, false);
});
