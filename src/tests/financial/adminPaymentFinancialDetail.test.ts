import assert from "node:assert/strict";
import test from "node:test";

import { paymentFinancialDetailDto } from "../../dtos/adminFinancial.dto";
import { AdminFinancialService } from "../../services/admin/adminFinancial.service";

const detail = () => paymentFinancialDetailDto({
  payment: {
    paymentReference: "PAY-ADMIN-DETAIL", bookingId: "booking-id", userId: "user-id", creatorId: "creator-id",
    status: "CAPTURED", amount: 105000, currency: "USD", serviceAmount: 100000, customerFeeAmount: 5000,
    provider: "INTERNAL", providerPaymentId: "provider-safe", escrowRecognizedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    providerPayload: { secret: "never expose" }, attributes: { internal: true }, reservationId: "hidden",
  },
  booking: { bookingReference: "BKG-DETAIL", status: "COMPLETED", paymentMethod: "WALLET", completedAt: new Date("2026-01-03T00:00:00.000Z"), settlementEligibleAt: new Date("2026-01-04T00:00:00.000Z") },
  reservation: {
    reservationReference: "RSV-DETAIL", status: "CAPTURED", amount: 105000, currency: "USD", authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
    capturedAt: new Date("2026-01-03T00:00:00.000Z"), captureReference: "CAP-SAFE", captureCause: "BOOKING_COMPLETION",
    walletId: "hidden", ledgerTransactionId: "hidden", captureTransactionId: "hidden", requestFingerprint: "hidden",
  },
  escrow: { allocationReference: "EALLOC-SAFE", status: "ALLOCATED", allocatedAt: new Date("2026-01-03T00:00:00.000Z"), allocationKey: "hidden", escrowLedgerTransaction: "hidden" },
  settlement: { settlementReference: "SET-SAFE", status: "SETTLED", settledAt: new Date("2026-01-05T00:00:00.000Z"), settlementKey: "hidden", settlementTransactionId: "hidden" },
});

test("Admin payment financial detail includes the safe Payment reference and status", () => {
  const result = detail();
  assert.equal(result.payment.paymentReference, "PAY-ADMIN-DETAIL");
  assert.equal(result.payment.status, "CAPTURED");
});

test("Admin payment financial detail preserves persisted payment amounts", () => {
  const result = detail();
  assert.equal(result.payment.amount, 105000);
  assert.equal(result.payment.serviceAmount, 100000);
  assert.equal(result.payment.customerFeeAmount, 5000);
});

test("Admin payment financial detail provides only the safe provider reference", () => {
  const result = detail() as Record<string, unknown>;
  assert.equal((result.payment as Record<string, unknown>).providerReference, "provider-safe");
  assert.equal(JSON.stringify(result).includes("providerPayload"), false);
});

test("Admin payment financial detail includes the safe booking relationship", () => {
  const result = detail();
  assert.deepEqual(result.booking?.bookingReference, "BKG-DETAIL");
  assert.equal(result.booking?.paymentMethod, "WALLET");
});

test("Admin payment financial detail exposes reservation lifecycle status and amount", () => {
  const result = detail();
  assert.equal(result.reservation?.status, "CAPTURED");
  assert.equal(result.reservation?.amount, 105000);
  assert.equal(result.reservation?.currency, "USD");
});

test("Admin payment financial detail exposes reservation capture timestamps without internals", () => {
  const result = detail() as Record<string, unknown>;
  assert.equal((result.reservation as Record<string, unknown>).captureReference, "CAP-SAFE");
  assert.equal(JSON.stringify(result).includes("captureTransactionId"), false);
  assert.equal(JSON.stringify(result).includes("walletId"), false);
});

test("Admin payment financial detail exposes reservation release fields only when persisted", () => {
  const result = paymentFinancialDetailDto({ payment: detail().payment, reservation: { reservationReference: "RSV-RELEASE", status: "RELEASED", amount: 105000, currency: "USD", releasedAt: new Date("2026-01-03T00:00:00.000Z"), releaseReference: "REL-SAFE", releaseCause: "BOOKING_CANCELLED" } });
  assert.equal(result.reservation.releaseReference, "REL-SAFE");
  assert.equal(result.reservation.captureReference, undefined);
});

test("Admin payment financial detail includes a bounded escrow relationship", () => {
  const result = detail();
  assert.equal(result.escrow?.allocationReference, "EALLOC-SAFE");
  assert.equal(JSON.stringify(result).includes("escrowLedgerTransaction"), false);
});

test("Admin payment financial detail includes a bounded settlement relationship", () => {
  const result = detail();
  assert.equal(result.settlement?.settlementReference, "SET-SAFE");
  assert.equal(JSON.stringify(result).includes("settlementTransactionId"), false);
});

test("Admin payment financial detail remains safe when no Wallet financial relationships exist", () => {
  const result = paymentFinancialDetailDto({ payment: detail().payment });
  assert.equal(result.reservation, undefined);
  assert.equal(result.escrow, undefined);
  assert.equal(result.settlement, undefined);
});

test("Admin payment financial detail represents an active reservation without inferring Payment state", () => {
  const result = paymentFinancialDetailDto({ payment: detail().payment, reservation: { reservationReference: "RSV-ACTIVE", status: "ACTIVE", amount: 105000, currency: "USD", authorizedAt: new Date("2026-01-01T00:00:00.000Z") } });
  assert.equal(result.payment.status, "CAPTURED");
  assert.equal(result.reservation.status, "ACTIVE");
});

test("Admin payment financial detail returns a bounded not-found error for an absent Payment", async () => {
  const service = new AdminFinancialService();
  (service as unknown as { read: { paymentFinancialDetail: (reference: string) => Promise<null> } }).read = {
    paymentFinancialDetail: async () => null,
  };
  await assert.rejects(service.getPaymentFinancialDetail("PAY-MISSING"), /Payment not found/);
});
