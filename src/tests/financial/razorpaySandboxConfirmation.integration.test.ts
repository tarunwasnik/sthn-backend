import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import test, { after, before, beforeEach } from "node:test";
import { Booking } from "../../models/booking.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorPayoutAuthorization } from "../../models/creatorPayoutAuthorization.model";
import { CreatorBalance } from "../../models/creatorBalance.model";
import { CreatorWithdrawalRequest } from "../../models/creatorWithdrawalRequest.model";
import { Withdrawal } from "../../models/withdrawal.model";
import { Payout } from "../../models/payout.model";
import { Wallet } from "../../models/wallet.model";
import { FxRateAudit } from "../../models/fxRateAudit.model";
import { Refund } from "../../models/refund.model";
import { RefundAuthorization } from "../../models/refundAuthorization.model";
import bookingRoutes from "../../routes/v1/booking.routes";
import { paymentLifecycleService } from "../../services/financial/paymentLifecycle.service";
import { paymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { RazorpaySandboxPaymentProvider } from "../../services/financial/providers/razorpaySandbox.provider";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import crypto from "node:crypto";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { bookingFinancialTerminationService } from "../../services/financial/bookingFinancialTermination.service";
import { BookingTerminationActorType, BookingTerminationType } from "../../enums/booking/bookingTerminationType.enum";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "razorpay-confirmation-test";
before(async () => { await connectPhase7HDatabase(); }, { timeout: 120_000 }); beforeEach(clearPhase7HDatabase); after(disconnectPhase7HDatabase);

const server = async () => { const app = express(); app.use(express.json()); app.use("/api/v1/bookings", bookingRoutes); const listener = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const instance = app.listen(0, () => resolve(instance)); instance.once("error", reject); }); const port = (listener.address() as { port: number }).port; return { base: `http://127.0.0.1:${port}`, close: () => new Promise<void>(resolve => listener.close(() => resolve())) }; };
const token = (id: string) => jwt.sign({ id, role: "user" }, process.env.JWT_SECRET!);

async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const User = (await import("../../models/User")).default; const { UserProfile } = await import("../../models/userProfile.model");
  const customer = await User.create({ email: `rz-${Date.now()}-${Math.random()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: customer._id, username: `rz${String(customer._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test/a", cover: "https://test/c", profilePhotos: ["https://test/a", "https://test/b"], profileStatus: "verified" });
  const quote = createBookingCheckoutQuote({ customerId: String(customer._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount });
  const app = await server(); const response = await fetch(`${app.base}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token(String(customer._id))}`, "Idempotency-Key": `rz-${Date.now()}-${Math.random()}` }, body: JSON.stringify({ serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: quote.token }) });
  assert.equal(response.status, 201); const data = await response.json() as { booking: { _id: string } }; const booking = await Booking.findById(data.booking._id).orFail(); const payment = await Payment.findById(booking.paymentId).orFail(); const operation = await PaymentOperation.findOne({ paymentId: payment._id }).orFail();
  await Payment.updateOne({ _id: payment._id }, { $set: { provider: "RAZORPAY", status: "INITIALIZING", providerPaymentId: "order_test1", providerOrderId: "order_test1" } });
  await PaymentOperation.collection.updateOne({ _id: operation._id }, { $set: { provider: "RAZORPAY", providerPaymentId: "order_test1", providerOrderId: "order_test1", status: "PENDING", "selectionEvidence.provider": "RAZORPAY", "selectionEvidence.simulator": false, "selectionEvidence.configurationVersion": "razorpay-sandbox-v1" } });
  return { app, customer, booking, payment: await Payment.findById(payment._id).orFail(), operation: await PaymentOperation.findById(operation._id).orFail() };
}
const body = (paymentId: string, overrides: Record<string, unknown> = {}) => ({ paymentId, razorpayOrderId: "order_test1", razorpayPaymentId: "pay_test1", razorpaySignature: "signature", ...overrides });
const post = (base: string, bookingId: string, auth: string | undefined, data: object) => fetch(`${base}/api/v1/bookings/${bookingId}/razorpay-sandbox-confirm`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(data) });
const razorpaySignature = (secret: string, orderId = "order_test1", paymentId = "pay_test1") => crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
const installRazorpayTransport = (secret: string, http: ConstructorParameters<typeof RazorpaySandboxPaymentProvider>[1]) => {
  const original = paymentProviderRegistry.get.bind(paymentProviderRegistry);
  const provider = new RazorpaySandboxPaymentProvider({ keyId: "rzp_test_adapter", keySecret: secret, webhookSecret: "webhook" }, http);
  (paymentProviderRegistry as any).get = (id: PaymentProvider) => id === PaymentProvider.RAZORPAY ? provider : original(id);
  return () => { (paymentProviderRegistry as any).get = original; };
};
const capturedPayment = (payment: { amount: number }, overrides: Record<string, unknown> = {}) => ({ id: "pay_test1", order_id: "order_test1", amount: payment.amount, currency: "INR", status: "captured", ...overrides });
const confirmationSideEffectCounts = () => Promise.all([
    CreatorEntitlement.countDocuments(), CreatorPayoutAuthorization.countDocuments(),
    CreatorBalance.countDocuments(), CreatorWithdrawalRequest.countDocuments(),
    Withdrawal.countDocuments(), Payout.countDocuments(), Wallet.countDocuments(), FxRateAudit.countDocuments(),
  ]);
const assertNoConfirmationSideEffects = async (before: number[]) => assert.deepEqual(await confirmationSideEffectCounts(), before);

test("Razorpay sandbox confirmation route enforces authentication, ownership, and existing booking/payment binding", async () => {
  const x = await fixture(); const original = paymentLifecycleService.confirmRazorpaySandboxPayment; let calls = 0;
  (paymentLifecycleService as any).confirmRazorpaySandboxPayment = async () => { calls++; return x.payment; };
  try { assert.equal((await post(x.app.base, String(x.booking._id), undefined, body(String(x.payment._id)))).status, 401); const other = await (await import("../../models/User")).default.create({ email: `other-${Date.now()}@test.local`, role: "user", status: "active" }); assert.equal((await post(x.app.base, String(x.booking._id), token(String(other._id)), body(String(x.payment._id)))).status, 403); assert.equal((await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body("507f1f77bcf86cd799439011"))).status, 403); assert.equal((await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id)))).status, 200); assert.equal(calls, 1); } finally { (paymentLifecycleService as any).confirmRazorpaySandboxPayment = original; await x.app.close(); }
});

test("Razorpay sandbox confirmation route rejects malformed evidence and production isolation is 404", async () => {
  const x = await fixture(); const prior = process.env.NODE_ENV; try { assert.equal((await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), { paymentId: String(x.payment._id) })).status, 400); process.env.NODE_ENV = "production"; assert.equal((await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id)))).status, 404); } finally { process.env.NODE_ENV = prior; await x.app.close(); }
});

test("Razorpay sandbox confirmation replay and concurrent submissions delegate no duplicate route effects", async () => {
  const x = await fixture(); const original = paymentLifecycleService.confirmRazorpaySandboxPayment; let calls = 0;
  (paymentLifecycleService as any).confirmRazorpaySandboxPayment = async () => { calls++; return x.payment; };
  try { const responses = await Promise.all(Array.from({ length: 3 }, () => post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id))))); assert.ok(responses.every(r => r.status === 200)); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1); assert.equal(calls, 3); } finally { (paymentLifecycleService as any).confirmRazorpaySandboxPayment = original; await x.app.close(); }
});

test("real Razorpay adapter path confirms one captured INR payment through the registered route", async () => {
  const x = await fixture(); const original = paymentProviderRegistry.get.bind(paymentProviderRegistry); const secret = "adapter-path-secret";
  const sideEffectsBefore = await confirmationSideEffectCounts();
  const provider = new RazorpaySandboxPaymentProvider({ keyId: "rzp_test_adapter", keySecret: secret, webhookSecret: "webhook" }, async request => {
    assert.equal(request.method, "GET"); assert.equal(request.path, "/v1/payments/pay_test1");
    return { status: 200, body: { id: "pay_test1", order_id: "order_test1", amount: x.payment.amount, currency: "INR", status: "captured" } };
  });
  (paymentProviderRegistry as any).get = (id: PaymentProvider) => id === PaymentProvider.RAZORPAY ? provider : original(id);
  const signature = crypto.createHmac("sha256", secret).update("order_test1|pay_test1").digest("hex");
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: signature }));
    assert.equal(response.status, 200, await response.text());
    const payment = await Payment.findById(x.payment._id).orFail(); const operation = await PaymentOperation.findById(x.operation._id).orFail(); const booking = await Booking.findById(x.booking._id).orFail();
    assert.equal(payment.status, "CAPTURED"); assert.equal(payment.providerPaymentId, "pay_test1"); assert.equal(operation.status, "CONFIRMED"); assert.equal(operation.providerOrderId, "order_test1"); assert.equal(operation.providerPaymentId, "pay_test1");
    assert.equal(await Booking.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1); assert.notEqual(booking.status, "ACCEPTED"); assert.notEqual(booking.status, "COMPLETED");
    await assertNoConfirmationSideEffects(sideEffectsBefore);
  } finally { (paymentProviderRegistry as any).get = original; await x.app.close(); }
});

test("real Razorpay adapter path rejects a captured amount different from the Financial Payment", async () => {
  const x = await fixture(); const secret = "amount-mismatch-secret";
  const restore = installRazorpayTransport(secret, async () => ({ status: 200, body: capturedPayment(x.payment, { amount: x.payment.amount + 1 }) }));
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    assert.equal(response.status, 400, await response.text());
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "INITIALIZING");
    const operation = await PaymentOperation.findById(x.operation._id).orFail(); assert.equal(operation.status, "PENDING"); assert.equal(operation.providerPaymentId, "order_test1");
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path rejects non-INR captured evidence", async () => {
  const x = await fixture(); const secret = "currency-mismatch-secret";
  const restore = installRazorpayTransport(secret, async () => ({ status: 200, body: capturedPayment(x.payment, { currency: "USD" }) }));
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    assert.equal(response.status, 400, await response.text());
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "INITIALIZING");
    assert.equal((await PaymentOperation.findById(x.operation._id).orFail()).providerPaymentId, "order_test1");
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path rejects evidence for a different Razorpay order", async () => {
  const x = await fixture(); const secret = "order-mismatch-secret";
  const restore = installRazorpayTransport(secret, async () => ({ status: 200, body: capturedPayment(x.payment, { order_id: "order_other" }) }));
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    assert.equal(response.status, 400, await response.text());
    const payment = await Payment.findById(x.payment._id).orFail(); const operation = await PaymentOperation.findById(x.operation._id).orFail();
    assert.equal(payment.providerPaymentId, "order_test1"); assert.equal(payment.status, "INITIALIZING"); assert.equal(operation.providerPaymentId, "order_test1");
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path does not fund a booking from an authorized payment", async () => {
  const x = await fixture(); const secret = "authorized-payment-secret";
  const restore = installRazorpayTransport(secret, async () => ({ status: 200, body: capturedPayment(x.payment, { status: "authorized" }) }));
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    assert.equal(response.status, 400, await response.text());
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "INITIALIZING"); assert.equal((await PaymentOperation.findById(x.operation._id).orFail()).status, "PENDING");
    assert.notEqual((await Booking.findById(x.booking._id).orFail()).status, "ACCEPTED");
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path records an indeterminate provider lookup as UNKNOWN without another payment", async () => {
  const x = await fixture(); const secret = "timeout-secret"; let calls = 0;
  const sideEffectsBefore = await confirmationSideEffectCounts();
  const restore = installRazorpayTransport(secret, async () => { calls++; throw new Error("simulated Razorpay timeout"); });
  try {
    const response = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    assert.equal(response.status, 400, await response.text());
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "INITIALIZING"); assert.equal((await PaymentOperation.findById(x.operation._id).orFail()).status, "UNKNOWN");
    assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1); assert.equal(calls, 1);
    await assertNoConfirmationSideEffects(sideEffectsBefore);
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path rejects a conflicting pay reference after capture", async () => {
  const x = await fixture(); const secret = "conflicting-payment-secret"; let calls = 0;
  const restore = installRazorpayTransport(secret, async () => { calls++; return { status: 200, body: capturedPayment(x.payment) }; });
  try {
    const first = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) })); assert.equal(first.status, 200, await first.text());
    const conflicting = await post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpayPaymentId: "pay_other", razorpaySignature: razorpaySignature(secret, "order_test1", "pay_other") }));
    assert.equal(conflicting.status, 400, await conflicting.text()); assert.equal((await Payment.findById(x.payment._id).orFail()).providerPaymentId, "pay_test1"); assert.equal((await PaymentOperation.findById(x.operation._id).orFail()).providerPaymentId, "pay_test1"); assert.equal(calls, 2);
  } finally { restore(); await x.app.close(); }
});

test("real Razorpay adapter path converges concurrent identical confirmations", async () => {
  const x = await fixture(); const secret = "concurrent-confirmation-secret"; let calls = 0;
  const sideEffectsBefore = await confirmationSideEffectCounts();
  const restore = installRazorpayTransport(secret, async () => { calls++; return { status: 200, body: capturedPayment(x.payment) }; });
  try {
    const responses = await Promise.all(Array.from({ length: 2 }, () => post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }))));
    assert.ok(responses.every((response) => response.status === 200), JSON.stringify(await Promise.all(responses.map((response) => response.text()))));
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "CAPTURED"); assert.equal((await PaymentOperation.findById(x.operation._id).orFail()).status, "CONFIRMED"); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Payment.countDocuments(), 1); assert.equal(await PaymentOperation.countDocuments(), 1); assert.ok(calls <= 4);
    await assertNoConfirmationSideEffects(sideEffectsBefore);
  } finally { restore(); await x.app.close(); }
});

test("an expired Razorpay order remains terminal and late capture creates one full-refund authorization", async () => {
  const x = await fixture(); const secret = "late-capture-terminal-secret"; let paymentLookups = 0;
  const sideEffectsBefore = await confirmationSideEffectCounts();
  const restore = installRazorpayTransport(secret, async request => {
    assert.equal(request.method, "GET"); paymentLookups++;
    return { status: 200, body: capturedPayment(x.payment) };
  });
  try {
    await Booking.updateOne({ _id: x.booking._id }, { $set: { status: "REQUESTED", expiresAt: new Date(Date.now() - 1) } });
    await bookingFinancialTerminationService.terminateBookingFinancially({ bookingId: String(x.booking._id), actorType: BookingTerminationActorType.SYSTEM, terminationType: BookingTerminationType.BOOKING_EXPIRED, reason: "test expiry" });
    assert.equal((await Booking.findById(x.booking._id).orFail()).status, "EXPIRED");
    assert.equal((await Payment.findById(x.payment._id).orFail()).status, "INITIALIZING");

    const confirmation = () => post(x.app.base, String(x.booking._id), token(String(x.customer._id)), body(String(x.payment._id), { razorpaySignature: razorpaySignature(secret) }));
    const first = await confirmation(); assert.equal(first.status, 200, await first.text());
    const second = await confirmation(); assert.equal(second.status, 200, await second.text());
    const booking = await Booking.findById(x.booking._id).orFail(); const payment = await Payment.findById(x.payment._id).orFail();
    assert.equal(booking.status, "EXPIRED"); assert.equal(payment.status, "CAPTURED"); assert.equal(await RefundAuthorization.countDocuments({ authority: "TERMINAL_LATE_CAPTURE_V1", decisionId: String(x.booking._id) }), 1);
    const refund = await Refund.findOne({ paymentId: payment._id }).orFail(); assert.equal(refund.amount, payment.amount); assert.equal(refund.currency, "INR"); assert.equal(refund.status, "APPROVED"); assert.equal(refund.providerPaymentId, "pay_test1");
    assert.equal(paymentLookups, 2); await assertNoConfirmationSideEffects(sideEffectsBefore);
  } finally { restore(); await x.app.close(); }
});
