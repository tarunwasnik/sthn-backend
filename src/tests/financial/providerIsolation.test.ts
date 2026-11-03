import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentProviderRegistry } from "../../services/financial/paymentProviderRegistry.service";
import { PaymentProviderService } from "../../services/payment/provider/paymentProvider.service";
import { payoutProviderRegistry } from "../../services/financial/payoutProviderRegistry.service";
import { internalPaymentProvider } from "../../services/financial/providers/internal.provider";
import { providerSimulatorService } from "../../services/providerSimulator/providerSimulator.service";
import { walletConversionProviderExecutionService } from "../../services/financial/walletConversionProviderExecution.service";
import { withdrawalProviderExecutionService } from "../../services/financial/withdrawalProviderExecution.service";
import { PaymentService } from "../../services/financial/payment.service";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { internalTopUpFundingService } from "../../services/financial/internalTopUpFunding.service";
import { InternalTopUpFundingOutcome } from "../../enums/financial/internalTopUpFundingOutcome.enum";

test("backend authority selects only the configured simulator capabilities", () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    const registry = new PaymentProviderRegistry();
    const request = { provider: PaymentProvider.INTERNAL, currency: "INR", operation: "PAYMENT" as const, requiredCapabilities: ["session", "verify", "status"] };
    assert.equal(registry.select(request).provider, PaymentProvider.INTERNAL);
    assert.throws(() => registry.select({ ...request, currency: "INVALID" }), /unavailable/);
    assert.throws(() => registry.select({ ...request, requiredCapabilities: ["refund"] }), /unavailable/);
    assert.throws(() => registry.select({ ...request, provider: PaymentProvider.STRIPE }), /unavailable/);
    assert.throws(() => Reflect.apply(registry.select, registry, [{ ...request, requiredCapabilities: ["invented"] }, [{ enabled: true, capabilities: ["invented"] }]]), /unavailable/);
    registry.unregister(PaymentProvider.INTERNAL);
    assert.throws(() => registry.select(request), /unavailable/);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test("payment creation rejects implicit provider and conflicting replay identity", async () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    const repository = { findByIdempotencyKey: async () => ({ provider: PaymentProvider.STRIPE, method: PaymentMethod.INTERNAL }) };
    const service = new PaymentService(repository as never);
    const input = { bookingId: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439012", creatorId: "507f1f77bcf86cd799439013", serviceAmount: { amount: 100, currency: "INR" as const }, idempotencyKey: "replay" };
    await assert.rejects(service.createPayment(input), /method is required/);
    await assert.rejects(service.createPayment({ ...input, method: PaymentMethod.INTERNAL }), /provider is required/);
    await assert.rejects(service.createPayment({ ...input, method: PaymentMethod.INTERNAL, provider: PaymentProvider.INTERNAL }), /replay provider identity conflicts/);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});

test("production rejects both registries and direct simulator entry points", async () => {
  const old = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => new PaymentProviderRegistry().get(PaymentProvider.INTERNAL), /unavailable/);
    assert.throws(() => new PaymentProviderRegistry().select({ provider: PaymentProvider.INTERNAL, currency: "INR", operation: "PAYMENT", requiredCapabilities: [] }), /unavailable/);
    assert.throws(() => payoutProviderRegistry.get(PaymentProvider.INTERNAL), /unavailable/);
    await assert.rejects(new PaymentProviderService().getPaymentStatus(PaymentProvider.INTERNAL, { providerPaymentId: "x" }), /unavailable/);
    await assert.rejects(internalPaymentProvider.getPaymentStatus({ providerPaymentId: "x" }), /unavailable/);
    await assert.rejects(providerSimulatorService.simulatePayout({ providerPayoutId: "x", action: "PAID" as never, adminId: "x" }), /unavailable/);
    await assert.rejects(walletConversionProviderExecutionService.execute({} as never), /unavailable/);
    await assert.rejects(withdrawalProviderExecutionService.execute({} as never), /unavailable/);
    await assert.rejects(internalTopUpFundingService.simulate("x", InternalTopUpFundingOutcome.SUCCESS), /unavailable/);
    delete process.env.NODE_ENV;
    assert.throws(() => new PaymentProviderRegistry().get(PaymentProvider.INTERNAL), /unavailable/);
  } finally { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; }
});
