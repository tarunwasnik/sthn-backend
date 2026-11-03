/// <reference path="../../types/express.d.ts" />
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { paymentService } from "../../services/financial/payment.service";
import { paymentLifecycleService } from "../../services/financial/paymentLifecycle.service";
import { paymentOperationService, PaymentOperationService } from "../../services/financial/paymentOperation.service";
import { paymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { internalPaymentProvider } from "../../services/financial/providers/internal.provider";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); await PaymentOperation.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase);

async function createPayment() {
  return paymentService.createPayment({ bookingId: new Types.ObjectId().toString(), userId: new Types.ObjectId().toString(), creatorId: new Types.ObjectId().toString(), serviceAmount: { amount: 800, currency: "INR" }, provider: PaymentProvider.INTERNAL, method: PaymentMethod.INTERNAL });
}

test("concurrent lifecycle requests admit exactly one provider session call", async () => {
  const payment = await createPayment();
  const originalCreate = internalPaymentProvider.createPaymentSession;
  const originalStatus = internalPaymentProvider.getPaymentStatus;
  let calls = 0;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  internalPaymentProvider.createPaymentSession = async () => { calls++; entered(); await gate; return { providerPaymentId: "dispatch-one" }; };
  internalPaymentProvider.getPaymentStatus = async () => ({ providerPaymentId: "dispatch-one", providerStatus: "PENDING" });
  try {
    const first = paymentLifecycleService.initializeExistingPayment(payment._id.toString());
    await started;
    await assert.rejects(paymentLifecycleService.initializeExistingPayment(payment._id.toString()), /already started|requires reconciliation/);
    assert.equal(calls, 1);
    const claimed = await PaymentOperation.findOne({ paymentId: payment._id }).orFail();
    assert.equal(claimed.dispatchKind, "PAYMENT_SESSION");
    assert.equal(claimed.attemptCount, 1);
    release();
    await first;
    await paymentLifecycleService.initializeExistingPayment(payment._id.toString());
    assert.equal(calls, 1);
  } finally { release(); internalPaymentProvider.createPaymentSession = originalCreate; internalPaymentProvider.getPaymentStatus = originalStatus; }
});

test("crash after durable admission stays blocked across service restart and identity conflicts", async () => {
  const payment = await createPayment();
  const operation = await paymentOperationService.prepare(payment);
  const claims = await Promise.allSettled([paymentOperationService.startAttempt(operation), paymentOperationService.startAttempt(operation)]);
  assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
  const reloaded = await new PaymentOperationService().prepare(payment);
  await assert.rejects(new PaymentOperationService().startAttempt(reloaded), /already started/);
  await assert.rejects(paymentLifecycleService.initializeExistingPayment(payment._id.toString()), /already started/);
  for (const changed of [{ provider: PaymentProvider.STRIPE }, { amount: payment.amount + 1 }, { currency: "USD" }]) {
    const conflicting = { ...payment.toObject(), ...changed } as typeof payment;
    await assert.rejects(paymentOperationService.prepare(conflicting), /identity conflicts/);
  }
  assert.equal((await PaymentOperation.findById(operation._id).orFail()).attemptCount, 1);
});

test("timeout remains unknown and cannot redispatch or confirm without evidence", async () => {
  const payment = await createPayment();
  const original = internalPaymentProvider.createPaymentSession;
  let calls = 0;
  internalPaymentProvider.createPaymentSession = async () => { calls++; throw new Error("timeout"); };
  try {
    await assert.rejects(paymentLifecycleService.initializeExistingPayment(payment._id.toString()), /timeout/);
    const operation = await paymentOperationService.prepare(payment);
    assert.equal(operation.status, PaymentOperationStatus.UNKNOWN);
    await assert.rejects(paymentLifecycleService.initializeExistingPayment(payment._id.toString()), /unknown/);
    await assert.rejects(paymentOperationService.reconcile(operation, { providerPaymentId: "unverified", providerStatus: "CAPTURED", amount: { amount: payment.amount, currency: payment.currency } }), /not linked/);
    assert.equal(calls, 1);
    assert.equal((await PaymentOperation.findById(operation._id).orFail()).status, PaymentOperationStatus.UNKNOWN);
  } finally { internalPaymentProvider.createPaymentSession = original; }
});

test("persisted provider session recovers without a second provider mutation", async () => {
  const payment = await createPayment();
  let operation = await paymentOperationService.prepare(payment);
  operation = await paymentOperationService.startAttempt(operation);
  await paymentOperationService.linkProviderSession(operation, { providerPaymentId: "recover-session" });
  const originalCreate = internalPaymentProvider.createPaymentSession;
  const originalStatus = internalPaymentProvider.getPaymentStatus;
  let calls = 0;
  internalPaymentProvider.createPaymentSession = async () => { calls++; throw new Error("unexpected mutation"); };
  internalPaymentProvider.getPaymentStatus = async () => ({ providerPaymentId: "recover-session", providerStatus: "CAPTURED", amount: { amount: payment.amount, currency: payment.currency } });
  try {
    await paymentLifecycleService.initializeExistingPayment(payment._id.toString());
    assert.equal(calls, 0);
    assert.equal((await PaymentOperation.findById(operation._id).orFail()).status, PaymentOperationStatus.CONFIRMED);
  } finally { internalPaymentProvider.createPaymentSession = originalCreate; internalPaymentProvider.getPaymentStatus = originalStatus; }
});

test("unavailable selection never invokes provider", async () => {
  const payment = await createPayment();
  const original = internalPaymentProvider.createPaymentSession;
  let calls = 0;
  internalPaymentProvider.createPaymentSession = async () => { calls++; throw new Error("unexpected mutation"); };
  paymentProviderRegistry.unregister(PaymentProvider.INTERNAL);
  try {
    await assert.rejects(paymentLifecycleService.initializeExistingPayment(payment._id.toString()), /unavailable/);
    assert.equal(calls, 0);
    assert.equal(await PaymentOperation.countDocuments({ paymentId: payment._id }), 0);
  } finally { paymentProviderRegistry.register(internalPaymentProvider); internalPaymentProvider.createPaymentSession = original; }
});
