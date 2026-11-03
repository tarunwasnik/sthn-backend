import assert from "node:assert/strict";
import test from "node:test";

import {
  FINANCIAL_POLICY_CONTENT_REFERENCE,
  FINANCIAL_POLICY_VERSION,
  createBookingCheckoutQuote,
  verifyBookingCheckoutQuote,
} from "../../services/booking/bookingCheckoutQuote.service";

process.env.JWT_SECRET ??= "booking-checkout-quote-test-secret";

const input = {
  customerId: "customer-1", creatorId: "creator-1", serviceId: "service-1",
  slotIds: ["slot-b", "slot-a"], currency: "INR" as const,
  serviceAmount: 100_000, customerFeeAmount: 5_000, totalAmount: 105_000,
};

test("checkout quotes bind canonical pricing, owner, service, and selected slots", () => {
  const now = new Date("2026-10-24T00:00:00.000Z");
  const { quote, token } = createBookingCheckoutQuote(input, now);
  const verified = verifyBookingCheckoutQuote(token, input, new Date("2026-10-24T00:01:00.000Z"));
  assert.equal(verified.quoteId, quote.quoteId);
  assert.equal(verified.financialPolicyVersion, FINANCIAL_POLICY_VERSION);
  assert.deepEqual(verified.slotIds, ["slot-a", "slot-b"]);
  assert.equal(verified.serviceAmount + verified.customerFeeAmount, verified.totalAmount);
  assert.equal(FINANCIAL_POLICY_CONTENT_REFERENCE, null);
});

test("checkout quotes reject tampering, expiry, and changed authoritative pricing", () => {
  const now = new Date("2026-10-24T00:00:00.000Z");
  const { token } = createBookingCheckoutQuote(input, now);
  assert.throws(() => verifyBookingCheckoutQuote(`${token}x`, input, now), /invalid/i);
  assert.throws(() => verifyBookingCheckoutQuote(token, input, new Date("2026-10-24T00:15:00.000Z")), /expired/i);
  assert.throws(() => verifyBookingCheckoutQuote(token, { ...input, totalAmount: 105_001 }, now), /stale/i);
});
