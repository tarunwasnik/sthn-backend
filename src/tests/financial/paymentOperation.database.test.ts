import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";

import { PaymentOperation } from "../../models/paymentOperation.model";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { paymentOperationService } from "../../services/financial/paymentOperation.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

const payment = (suffix: string, overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(), bookingId: new Types.ObjectId(), userId: new Types.ObjectId(),
  provider: PaymentProvider.INTERNAL, idempotencyKey: `payment-operation-${suffix}`,
  amount: 800, currency: "INR", ...overrides,
}) as any;

before(async () => { process.env.NODE_ENV = "test"; await connectPhase7HDatabase(); await PaymentOperation.init(); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase);

test("payment operation database replay selects hidden ownership fields and is concurrency-safe", async () => {
  const source = payment("prepare");
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => paymentOperationService.prepare(source)));
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  assert.equal(await PaymentOperation.countDocuments({ paymentId: source._id }), 1);
  const replay = await paymentOperationService.prepare(source);
  assert.equal(replay.userId.toString(), source.userId.toString());
  await assert.rejects(() => paymentOperationService.prepare({ ...source, userId: new Types.ObjectId() }), /identity conflicts/);
  await assert.rejects(() => paymentOperationService.prepare({ ...source, idempotencyKey: "conflicting-key" }), /identity conflicts/);
});

test("payment operation database reconciliation confirms once and replays terminal evidence", async () => {
  const source = payment("confirmed");
  let operation = await paymentOperationService.prepare(source);
  operation = await paymentOperationService.linkProviderSession(operation, { providerPaymentId: "provider-confirmed" });
  const captured = { providerPaymentId: "provider-confirmed", providerStatus: "CAPTURED", amount: { amount: 800, currency: "INR" as const } };
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => paymentOperationService.reconcile(operation, captured)));
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled"]);
  const persisted = await PaymentOperation.findById(operation._id).select("+userId +idempotencyKey").orFail();
  assert.equal(persisted.status, PaymentOperationStatus.CONFIRMED);
  assert.equal(persisted.history.filter((event) => event.kind === "CONFIRMED").length, 1);
  assert.equal(persisted.reconciliationAttemptCount, 1);
  await paymentOperationService.reconcile(operation, captured);
  const replayed = await PaymentOperation.findById(operation._id).orFail();
  assert.equal(replayed.history.filter((event) => event.kind === "CONFIRMED").length, 1);
  assert.equal(replayed.reconciliationAttemptCount, 1);
});

test("payment operation database increments genuine concurrent non-terminal reconciliation attempts", async () => {
  const source = payment("pending-attempts");
  let operation = await paymentOperationService.prepare(source);
  operation = await paymentOperationService.linkProviderSession(operation, { providerPaymentId: "provider-pending-attempts" });
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => paymentOperationService.reconcile(operation, { providerPaymentId: "provider-pending-attempts", providerStatus: "PENDING" })));
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled"]);
  const persisted = await PaymentOperation.findById(operation._id).orFail();
  assert.equal(persisted.reconciliationAttemptCount, 3);
  assert.equal(persisted.history.filter((event) => event.kind === "RECONCILIATION_ATTEMPT").length, 3);
});

test("payment operation database preserves one terminal outcome and rejects conflicts", async () => {
  const source = payment("conflict");
  let operation = await paymentOperationService.prepare(source);
  operation = await paymentOperationService.linkProviderSession(operation, { providerPaymentId: "provider-conflict" });
  const settled = await Promise.allSettled([
    paymentOperationService.reconcile(operation, { providerPaymentId: "provider-conflict", providerStatus: "CAPTURED", amount: { amount: 800, currency: "INR" } }),
    paymentOperationService.reconcile(operation, { providerPaymentId: "provider-conflict", providerStatus: "FAILED" }),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
  const persisted = await PaymentOperation.findById(operation._id).orFail();
  assert.equal(persisted.history.filter((event) => event.kind === "CONFIRMED" || event.kind === "FAILED").length, 1);
});

test("payment operation database enforces provider uniqueness and keeps unknown outcomes non-chargeable", async () => {
  const source = payment("unknown");
  let operation = await paymentOperationService.prepare(source);
  operation = await paymentOperationService.linkProviderSession(operation, { providerPaymentId: "provider-unique" });
  operation = await paymentOperationService.markUnknown(operation, "timeout");
  await assert.rejects(() => paymentOperationService.startAttempt(operation), /requires reconciliation/);
  await assert.rejects(() => PaymentOperation.create({ operationReference: "duplicate-provider-reference", paymentId: new Types.ObjectId(), bookingId: new Types.ObjectId(), userId: new Types.ObjectId(), provider: PaymentProvider.INTERNAL, selectionEvidence: { operation: "COLLECTION", provider: PaymentProvider.INTERNAL, configurationVersion: "test", selectedAt: new Date(), rationale: "test", simulator: true }, idempotencyKey: "duplicate-provider-idempotency", requestedAmount: 800, requestedCurrency: "INR", providerPaymentId: "provider-unique", history: [] }), /duplicate key/);
  await assert.rejects(() => paymentOperationService.reconcile(operation, { providerPaymentId: "provider-unique", providerStatus: "CAPTURED", amount: { amount: 801, currency: "INR" } }), /amount or currency/);
});
