import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Booking } from "../../../models/booking.model";
import { Payment } from "../../../models/payment.model";
import InternalPayment from "../../../models/internalProvider/internalPayment.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { WalletTopUpOperationalAudit } from "../../../models/walletTopUpOperationalAudit.model";
import { WalletTopUpOperationalAction } from "../../../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpRequest } from "../../../models/walletTopUpRequest.model";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { paymentService } from "../../../services/financial/payment.service";
import { paymentLifecycleService } from "../../../services/financial/paymentLifecycle.service";
import { marketplacePricingService } from "../../../services/financial/marketplacePricing.service";
import { PaymentProvider } from "../../../enums/financial/paymentProvider.enum";
import { PaymentMethod } from "../../../enums/financial/paymentMethod.enum";
import { startTestHttpServer } from "./helpers/http";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
} from "./fixtures/topUpFixtures";

export const registerBookingAndAuthorizationTests = () => {
  test("phase7h booking-payment boundary: Booking uses Payment and InternalPayment only", async () => {
    const actors = await createActors();
    const pricing = marketplacePricingService.calculate({
      serviceAmount: 1_200,
      currency: "INR",
    });
    const booking = await Booking.create({
      _id: new Types.ObjectId(),
      slotIds: [new Types.ObjectId()],
      userId: actors.userId,
      creatorId: actors.creatorId,
      serviceId: new Types.ObjectId(),
      serviceTitle: "Phase 7H booking payment boundary",
      durationMinutes: 30,
      price: 1_200,
      serviceAmount: pricing.serviceAmount,
      platformFeeAmount: pricing.platformFeeAmount,
      commissionAmount: pricing.commissionAmount,
      creatorAmount: pricing.creatorAmount,
      totalAmount: pricing.totalAmount,
      currency: "INR",
      status: "REQUESTED",
      paymentStatus: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const payment = await paymentService.createPayment({
      bookingId: booking._id.toString(),
      userId: actors.userId.toString(),
      creatorId: actors.creatorId.toString(),
      serviceAmount: { amount: booking.price, currency: "INR" },
      provider: PaymentProvider.INTERNAL,
      method: PaymentMethod.INTERNAL,
      idempotencyKey: `phase7h-booking-payment:${booking._id}`,
    });
    booking.paymentId = payment._id as Types.ObjectId;
    await booking.save();
    await paymentLifecycleService.completePaymentLifecycle(payment._id.toString());

    const [payments, internalPayments, topUpFunding, reloadedBooking] = await Promise.all([
      Payment.find({ bookingId: booking._id }),
      InternalPayment.find({ paymentId: payment._id }),
      InternalTopUpFunding.countDocuments({}),
      Booking.findById(booking._id),
    ]);
    assert.equal(payments.length, 1);
    assert.equal(internalPayments.length, 1);
    assert.ok(internalPayments[0].paymentId.equals(payment._id as Types.ObjectId));
    assert.equal(topUpFunding, 0);
    assert.equal(reloadedBooking?.status, "REQUESTED");
    await assert.rejects(
      () => walletTopUpReconciliationService.inspectForOperation(payment.paymentReference),
      (error: any) => error?.code === "WALLET_TOP_UP_RECONCILIATION_REQUEST_NOT_FOUND",
    );
    assert.equal((await Booking.findById(booking._id))?.status, "REQUESTED");
  });

  test("phase7h booking-payment boundary: Wallet funding creates no Payment or InternalPayment", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 880);
    await completeFundedTopUp(request.topUpReference);
    assert.equal(await Payment.countDocuments({}), 0);
    assert.equal(await InternalPayment.countDocuments({}), 0);
    assert.equal(await InternalTopUpFunding.countDocuments({ topUpReference: request.topUpReference }), 1);
  });

  test("phase7h Admin authorization: unauthenticated/User/Creator rejected and Admin response is safe", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 890);
    process.env.JWT_SECRET = "phase7h-test-jwt-secret";
    const tokens = {
      user: jwt.sign({ id: actors.userId.toString(), role: "user" }, process.env.JWT_SECRET),
      creator: jwt.sign({ id: actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET),
      admin: jwt.sign({ id: actors.adminId.toString(), role: "admin" }, process.env.JWT_SECRET),
    };
    const server = await startTestHttpServer();
    const url = `${server.baseUrl}/api/v1/admin/financial/wallet-top-up-requests/${request.topUpReference}/reconciliation`;
    try {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${tokens.user}` } })).status, 403);
      assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${tokens.creator}` } })).status, 403);
      const adminResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      assert.equal(adminResponse.status, 200);
      const body = await adminResponse.json() as { success: boolean; data: Record<string, unknown> };
      assert.equal(body.success, true);
      for (const forbidden of [
        "_id", "userId", "walletId", "providerFundingId", "ledgerEntryId",
        "walletProjectionOperationId", "fingerprint", "idempotencyKey",
      ]) assert.equal(forbidden in body.data, false);

      const spoofed = await fetch(
        `${server.baseUrl}/api/v1/admin/financial/wallet-top-up-reconciliations/missing/retry`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.admin}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: WalletTopUpOperationalAction.RETRY_ACCOUNTING,
            adminUserId: actors.userId.toString(),
          }),
        },
      );
      assert.equal(spoofed.status, 400);
      const missing = await fetch(
        `${server.baseUrl}/api/v1/admin/financial/wallet-top-up-reconciliations/does-not-exist/retry`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.admin}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: WalletTopUpOperationalAction.RETRY_ACCOUNTING }),
        },
      );
      assert.equal(missing.status, 404);
      const errorBody = await missing.json() as Record<string, unknown>;
      assert.equal("stack" in errorBody, false);
      assert.equal("fingerprint" in errorBody, false);
    } finally {
      await server.close();
    }
  });

  test("phase7h audit persistence: inspect, acknowledge, and resolve use authenticated actor", async () => {
    const actors = await createActors();
    const valid = await createFundedTopUp(actors, 895);
    await completeFundedTopUp(valid.request.topUpReference);
    const validInspection = await walletTopUpReconciliationService.inspect(
      valid.request.topUpReference, actors.adminId.toString(),
    );
    await walletTopUpReconciliationService.updateStatus({
      reconciliationReference: validInspection.reconciliationReference,
      action: WalletTopUpOperationalAction.RESOLVE_RECONCILIATION,
      resolutionCode: "PHASE7H_VALIDATED",
      adminUserId: actors.adminId.toString(),
    });

    const corrupted = await createFundedTopUp(actors, 896);
    await completeFundedTopUp(corrupted.request.topUpReference);
    await WalletTopUpRequest.collection.updateOne(
      { _id: corrupted.request._id }, { $unset: { completedAt: "", accountingCompletedAt: "" } },
    );
    const corruptedInspection = await walletTopUpReconciliationService.inspect(
      corrupted.request.topUpReference, actors.adminId.toString(),
    );
    await walletTopUpReconciliationService.updateStatus({
      reconciliationReference: corruptedInspection.reconciliationReference,
      action: WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
      resolutionCode: "PHASE7H_ACKNOWLEDGED",
      adminUserId: actors.adminId.toString(),
    });

    const audits = await WalletTopUpOperationalAudit.find({
      action: {
        $in: [
          WalletTopUpOperationalAction.INSPECT,
          WalletTopUpOperationalAction.RESOLVE_RECONCILIATION,
          WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
        ],
      },
    }).select("+actorId");
    assert.ok(audits.length >= 4);
    assert.ok(audits.every((audit) => audit.actorId?.equals(actors.adminId)));
    assert.ok(audits.every((audit) => audit.createdAt instanceof Date));
    assert.ok(audits.every((audit) =>
      !JSON.stringify(audit.toObject()).match(/password|authorization|stack|rawProvider/i)));
  });
};
