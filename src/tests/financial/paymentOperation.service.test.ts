import assert from "node:assert/strict";
import test from "node:test";

import { PaymentOperationService } from "../../services/financial/paymentOperation.service";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

const id = (value: string) => ({ toString: () => value, equals: (other: unknown) => String(other) === value });
const payment = () => ({ _id: id("payment-1"), bookingId: id("booking-1"), userId: id("user-1"), provider: PaymentProvider.INTERNAL, idempotencyKey: "idem-1", amount: 800, currency: "INR" }) as any;

class MemoryOperations {
  operation: any;
  async findByPaymentId() { return this.operation ?? null; }
  async findById() { return this.operation ?? null; }
  async create(data: any) { this.operation = { _id: id("operation-1"), ...data, attemptCount: data.attemptCount ?? 0, reconciliationAttemptCount: data.reconciliationAttemptCount ?? 0, history: data.history ?? [] }; return this.operation; }
  async update(_id: unknown, update: Record<string, unknown>, history: unknown) { Object.assign(this.operation, update); this.operation.history.push(history); return this.operation; }
  async claimSessionDispatch(_operation: unknown, at: Date) { if (this.operation.attemptCount !== 0) return null; Object.assign(this.operation, { attemptCount: 1, dispatchStartedAt: at, dispatchKind: "PAYMENT_SESSION" }); this.operation.history.push({ kind: "ATTEMPT_STARTED", occurredAt: at }); return this.operation; }
  async transitionReconciliation(input: any) { Object.assign(this.operation, input.update); this.operation.reconciliationAttemptCount += 1; this.operation.history.push(input.history); return this.operation; }
}

test("payment operation: creation is replay-safe and bound to one payment identity", async () => {
  const store = new MemoryOperations();
  const service = new PaymentOperationService(store as any);
  const first = await service.prepare(payment());
  const replay = await service.prepare(payment());
  assert.equal(first, replay);
  assert.equal(first.status, PaymentOperationStatus.PENDING);
  assert.equal(first.selectionEvidence.provider, PaymentProvider.INTERNAL);
  assert.equal(first.selectionEvidence.simulator, true);
  assert.equal(first.history.length, 1);
  await assert.rejects(() => service.prepare({ ...payment(), amount: 801 }), /identity conflicts/);
});

test("payment operation: timeout becomes unknown and prevents another charge attempt", async () => {
  const store = new MemoryOperations(); const service = new PaymentOperationService(store as any);
  const operation = await service.prepare(payment());
  await service.startAttempt(operation);
  await service.markUnknown(operation, "timeout");
  assert.equal(operation.status, PaymentOperationStatus.UNKNOWN);
  await assert.rejects(() => service.startAttempt(operation), /requires reconciliation/);
  assert.equal(operation.history[operation.history.length - 1]?.kind, "UNKNOWN");
});

test("payment operation: reconciliation retries retain history and confirm only matching captured money", async () => {
  const store = new MemoryOperations(); const service = new PaymentOperationService(store as any);
  let operation = await service.prepare(payment());
  operation = await service.linkProviderSession(operation, { providerPaymentId: "provider-1" });
  operation = await service.reconcile(operation, { providerPaymentId: "provider-1", providerStatus: "PENDING" });
  assert.equal(operation.status, PaymentOperationStatus.PENDING);
  operation = await service.reconcile(operation, { providerPaymentId: "provider-1", providerStatus: "CAPTURED", amount: { amount: 800, currency: "INR" } });
  assert.equal(operation.status, PaymentOperationStatus.CONFIRMED);
  assert.equal(operation.reconciliationAttemptCount, 2);
  assert.equal(operation.verifiedAmount, 800);
  assert.equal(operation.verifiedCurrency, "INR");
});

test("payment operation: mismatched or contradictory outcomes are rejected without ledger mutation", async () => {
  const store = new MemoryOperations(); const service = new PaymentOperationService(store as any);
  let operation = await service.prepare(payment());
  operation = await service.linkProviderSession(operation, { providerPaymentId: "provider-1" });
  await assert.rejects(() => service.reconcile(operation, { providerPaymentId: "provider-1", providerStatus: "CAPTURED", amount: { amount: 801, currency: "INR" } }), /amount or currency/);
  operation = await service.reconcile(operation, { providerPaymentId: "provider-1", providerStatus: "CAPTURED", amount: { amount: 800, currency: "INR" } });
  await assert.rejects(() => service.reconcile(operation, { providerPaymentId: "provider-1", providerStatus: "FAILED" }), /failed terminal outcome/);
  assert.equal((operation as any).ledgerReference, undefined);
});
