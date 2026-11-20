import assert from "node:assert/strict";
import test from "node:test";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { RazorpaySandboxPaymentProvider } from "../../services/financial/providers/razorpaySandbox.provider";

test("provider eligibility permits INR sandbox and rejects USD before dispatch", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  try {
    const registry = new PaymentProviderRegistry();
    let dispatches = 0;
    const provider = new RazorpaySandboxPaymentProvider(
      { keyId: "rzp_test_fixture", keySecret: "fixture", webhookSecret: "fixture" },
      async () => { dispatches++; throw new Error("unexpected dispatch"); },
    );
    registry.register(provider);
    const selection = { provider: PaymentProvider.RAZORPAY, operation: "PAYMENT" as const, requiredCapabilities: ["session", "verify", "status"] };
    assert.equal(registry.select({ ...selection, currency: "INR" }), provider);
    assert.throws(() => registry.select({ ...selection, currency: "USD" }), /only for INR bookings/);
    assert.equal(dispatches, 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});
