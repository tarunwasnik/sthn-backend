/**
 * Opt-in local harness for Phase 7O browser checkout validation.
 * It owns a disposable MongoMemoryReplSet and deliberately ignores any
 * configured MONGODB_URI so it cannot target a shared development database.
 */
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import routes from "../routes";
import { errorHandler } from "../middlewares/errorHandler";
import { notFound } from "../middlewares/notFound";
import User from "../models/User";
import { UserProfile } from "../models/userProfile.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CreatorService } from "../models/creatorService.model";
import { Availability } from "../models/availability.model";
import { Slot } from "../models/slot.model";
import { Booking } from "../models/booking.model";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";
import { BookingFundingIntent } from "../models/bookingFundingIntent.model";
import { Refund } from "../models/refund.model";
import { Wallet } from "../models/wallet.model";
import { CreatorEntitlement } from "../models/creatorEntitlement.model";
import { CreatorPayoutAuthorization } from "../models/creatorPayoutAuthorization.model";
import { CreatorBalance } from "../models/creatorBalance.model";
import { CreatorWithdrawalRequest } from "../models/creatorWithdrawalRequest.model";
import { Withdrawal } from "../models/withdrawal.model";
import { Payout } from "../models/payout.model";
import { FxRateAudit } from "../models/fxRateAudit.model";
import { razorpaySandboxConfigurationFromEnvironment } from "../services/financial/providers/razorpaySandbox.provider";

const required = () => {
  assert.equal(process.env.STHN_PHASE7O_E2E, "true", "Phase 7O E2E requires STHN_PHASE7O_E2E=true.");
  assert.equal(process.env.NODE_ENV, "test", "Phase 7O E2E requires NODE_ENV=test.");
  assert.ok(razorpaySandboxConfigurationFromEnvironment(), "Razorpay test configuration is required.");
};

async function seed() {
  const password = await bcrypt.hash("Phase7O-Synthetic-Only", 10);
  const [customer, creator] = await User.create([
    { email: "phase7o.customer@test.local", password, role: "user", status: "active", authProvider: "local" },
    { email: "phase7o.creator@test.local", password, role: "creator", status: "active", authProvider: "local", creatorStatus: "approved" },
  ]);
  await UserProfile.create({ userId: customer._id, username: "phase7o_customer", dateOfBirth: new Date("1990-01-01"), interests: ["testing"], bio: "Synthetic Phase 7O customer", avatar: "https://test.invalid/avatar", cover: "https://test.invalid/cover", profilePhotos: ["https://test.invalid/one", "https://test.invalid/two"], profileStatus: "verified" });
  await CreatorProfile.create({ userId: creator._id, slug: "phase7o-creator", displayName: "Phase 7O Creator", primaryCategory: "testing", country: "IN", city: "Test City", currency: "INR", status: "active" });
  const service = await CreatorService.create({ creatorId: creator._id, title: "Phase 7O Test Service", description: "Synthetic browser E2E service", durationMinutes: 30, price: 5, currency: "INR", isActive: true });
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(0, 0, 0, 0);
  const availability = await Availability.create({ creatorId: creator._id, serviceId: service._id, date, startTime: "10:00", endTime: "10:30", timezone: "UTC", slotDurationMinutes: 30, status: "ACTIVE" });
  const start = new Date(date);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMinutes(end.getUTCMinutes() + 30);
  await Slot.create({ availabilityId: availability._id, creatorId: creator._id, serviceId: service._id, startTime: start, endTime: end, timezone: "UTC", status: "AVAILABLE", price: 5 });
  return { slug: "phase7o-creator", customerEmail: customer.email, creatorEmail: creator.email };
}

async function main() {
  required();
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION ?? "8.2.6";
  const mongoBinary = process.env.MONGOMS_SYSTEM_BINARY;
  assert.ok(mongoBinary, "Phase 7O requires a project-owned MongoDB system binary.");
  console.log(JSON.stringify({ phase7o: "mongodb-starting", version: process.env.MONGOMS_VERSION, source: "project-owned-system-binary" }));
  const replSet = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION, systemBinary: mongoBinary }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  console.log(JSON.stringify({ phase7o: "mongodb-ready", version: process.env.MONGOMS_VERSION, source: "project-owned-system-binary" }));
  const uri = replSet.getUri("sthn_phase7o_browser_e2e_test");
  assert.match(uri, /sthn_phase7o_browser_e2e_test/, "Unsafe E2E database identity.");
  await mongoose.connect(uri, { autoIndex: true });
  const fixture = await seed();
  const frontendOrigin = process.env.PHASE7O_FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";
  assert.match(frontendOrigin, /^http:\/\/127\.0\.0\.1:\d+$/, "Phase 7O E2E frontend origin must be loopback.");
  const app = express();
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use("/api", routes);
  // Test-harness-only reconciliation metadata. This app is bound to loopback,
  // created only under NODE_ENV=test, and never registered in production routes.
  app.get("/phase7o/reconciliation/:bookingId", async (request, response) => {
    const booking = await Booking.findById(request.params.bookingId).lean();
    if (!booking?.paymentId) return response.status(404).json({ message: "Synthetic booking not found." });
    const operation = await PaymentOperation.findOne({ paymentId: booking.paymentId }).lean();
    if (!operation?.providerOrderId) return response.status(409).json({ message: "Razorpay session evidence is unavailable." });
    response.json({ bookingId: String(booking._id), paymentId: String(booking.paymentId), operationId: String(operation._id), razorpayOrderId: operation.providerOrderId, expectedAmount: operation.requestedAmount, expectedCurrency: operation.requestedCurrency, ...(operation.providerPaymentId?.startsWith("pay_") ? { providerPaymentId: operation.providerPaymentId } : {}) });
  });
  app.get("/phase7o/financial-verification/:bookingId", async (request, response) => {
    const booking = await Booking.findById(request.params.bookingId).lean();
    if (!booking?.paymentId) return response.status(404).json({ message: "Synthetic booking not found." });
    const [payment, operation, intent] = await Promise.all([
      Payment.findById(booking.paymentId).lean(),
      PaymentOperation.findOne({ paymentId: booking.paymentId }).lean(),
      BookingFundingIntent.findOne({ bookingId: booking._id }).lean(),
    ]);
    const counts = await Promise.all([
      Booking.countDocuments(), Payment.countDocuments(), PaymentOperation.countDocuments(), BookingFundingIntent.countDocuments(),
      Refund.countDocuments(), Wallet.countDocuments(), CreatorEntitlement.countDocuments(), CreatorPayoutAuthorization.countDocuments(),
      CreatorBalance.countDocuments(), CreatorWithdrawalRequest.countDocuments(), Withdrawal.countDocuments(), Payout.countDocuments(), FxRateAudit.countDocuments(),
    ]);
    response.json({
      booking: { status: booking.status, paymentId: String(booking.paymentId) },
      payment: payment && { status: payment.status, provider: payment.provider, amount: payment.amount, currency: payment.currency, hasCapturedProviderPaymentId: payment.providerPaymentId?.startsWith("pay_") === true },
      operation: operation && { status: operation.status, provider: operation.provider, requestedAmount: operation.requestedAmount, requestedCurrency: operation.requestedCurrency, verifiedAmount: operation.verifiedAmount, verifiedCurrency: operation.verifiedCurrency, hasCapturedProviderPaymentId: operation.providerPaymentId?.startsWith("pay_") === true },
      intent: intent && { paymentMatchesBooking: String(intent.paymentId) === String(booking.paymentId), operationMatchesPayment: String(intent.operationId) === String(operation?._id) },
      counts: { bookings: counts[0], payments: counts[1], operations: counts[2], intents: counts[3], refunds: counts[4], wallets: counts[5], entitlements: counts[6], payoutAuthorizations: counts[7], creatorBalances: counts[8], withdrawalRequests: counts[9], withdrawals: counts[10], payouts: counts[11], fxAudits: counts[12] },
    });
  });
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  const port = Number(process.env.PORT ?? 5001);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  console.log(JSON.stringify({ phase7o: "ready", database: "isolated-memory-replset", port, creatorSlug: fixture.slug, customerEmail: fixture.customerEmail, creatorEmail: fixture.creatorEmail }));
  const shutdown = async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await mongoose.disconnect(); await replSet.stop(); };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
