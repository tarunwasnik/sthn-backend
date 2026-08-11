"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingAndAuthorizationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = require("mongoose");
const booking_model_1 = require("../../../models/booking.model");
const payment_model_1 = require("../../../models/payment.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const walletTopUpOperationalAudit_model_1 = require("../../../models/walletTopUpOperationalAudit.model");
const walletTopUpOperationalAction_enum_1 = require("../../../enums/financial/walletTopUpOperationalAction.enum");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const walletTopUpReconciliation_service_1 = require("../../../services/financial/walletTopUpReconciliation.service");
const payment_service_1 = require("../../../services/financial/payment.service");
const paymentLifecycle_service_1 = require("../../../services/financial/paymentLifecycle.service");
const marketplacePricing_service_1 = require("../../../services/financial/marketplacePricing.service");
const paymentProvider_enum_1 = require("../../../enums/financial/paymentProvider.enum");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const http_1 = require("./helpers/http");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerBookingAndAuthorizationTests = () => {
    (0, node_test_1.test)("phase7h booking-payment boundary: Booking uses Payment and InternalPayment only", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const pricing = marketplacePricing_service_1.marketplacePricingService.calculate({
            serviceAmount: 1200,
            currency: "INR",
        });
        const booking = await booking_model_1.Booking.create({
            _id: new mongoose_1.Types.ObjectId(),
            slotIds: [new mongoose_1.Types.ObjectId()],
            userId: actors.userId,
            creatorId: actors.creatorId,
            serviceId: new mongoose_1.Types.ObjectId(),
            serviceTitle: "Phase 7H booking payment boundary",
            durationMinutes: 30,
            price: 1200,
            serviceAmount: pricing.serviceAmount,
            platformFeeAmount: pricing.platformFeeAmount,
            commissionAmount: pricing.commissionAmount,
            creatorAmount: pricing.creatorAmount,
            totalAmount: pricing.totalAmount,
            currency: "INR",
            status: "REQUESTED",
            paymentStatus: "PENDING",
            expiresAt: new Date(Date.now() + 60000),
        });
        const payment = await payment_service_1.paymentService.createPayment({
            bookingId: booking._id.toString(),
            userId: actors.userId.toString(),
            creatorId: actors.creatorId.toString(),
            serviceAmount: { amount: booking.price, currency: "INR" },
            provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
            method: paymentMethod_enum_1.PaymentMethod.INTERNAL,
            idempotencyKey: `phase7h-booking-payment:${booking._id}`,
        });
        booking.paymentId = payment._id;
        await booking.save();
        await paymentLifecycle_service_1.paymentLifecycleService.completePaymentLifecycle(payment._id.toString());
        const [payments, internalPayments, topUpFunding, reloadedBooking] = await Promise.all([
            payment_model_1.Payment.find({ bookingId: booking._id }),
            internalPayment_model_1.default.find({ paymentId: payment._id }),
            internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({}),
            booking_model_1.Booking.findById(booking._id),
        ]);
        strict_1.default.equal(payments.length, 1);
        strict_1.default.equal(internalPayments.length, 1);
        strict_1.default.ok(internalPayments[0].paymentId.equals(payment._id));
        strict_1.default.equal(topUpFunding, 0);
        strict_1.default.equal(reloadedBooking?.status, "REQUESTED");
        await strict_1.default.rejects(() => walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspectForOperation(payment.paymentReference), (error) => error?.code === "WALLET_TOP_UP_RECONCILIATION_REQUEST_NOT_FOUND");
        strict_1.default.equal((await booking_model_1.Booking.findById(booking._id))?.status, "REQUESTED");
    });
    (0, node_test_1.test)("phase7h booking-payment boundary: Wallet funding creates no Payment or InternalPayment", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 880);
        await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        strict_1.default.equal(await payment_model_1.Payment.countDocuments({}), 0);
        strict_1.default.equal(await internalPayment_model_1.default.countDocuments({}), 0);
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({ topUpReference: request.topUpReference }), 1);
    });
    (0, node_test_1.test)("phase7h Admin authorization: unauthenticated/User/Creator rejected and Admin response is safe", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 890);
        process.env.JWT_SECRET = "phase7h-test-jwt-secret";
        const tokens = {
            user: jsonwebtoken_1.default.sign({ id: actors.userId.toString(), role: "user" }, process.env.JWT_SECRET),
            creator: jsonwebtoken_1.default.sign({ id: actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET),
            admin: jsonwebtoken_1.default.sign({ id: actors.adminId.toString(), role: "admin" }, process.env.JWT_SECRET),
        };
        const server = await (0, http_1.startTestHttpServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/wallet-top-up-requests/${request.topUpReference}/reconciliation`;
        try {
            strict_1.default.equal((await fetch(url)).status, 401);
            strict_1.default.equal((await fetch(url, { headers: { Authorization: `Bearer ${tokens.user}` } })).status, 403);
            strict_1.default.equal((await fetch(url, { headers: { Authorization: `Bearer ${tokens.creator}` } })).status, 403);
            const adminResponse = await fetch(url, {
                headers: { Authorization: `Bearer ${tokens.admin}` },
            });
            strict_1.default.equal(adminResponse.status, 200);
            const body = await adminResponse.json();
            strict_1.default.equal(body.success, true);
            for (const forbidden of [
                "_id", "userId", "walletId", "providerFundingId", "ledgerEntryId",
                "walletProjectionOperationId", "fingerprint", "idempotencyKey",
            ])
                strict_1.default.equal(forbidden in body.data, false);
            const spoofed = await fetch(`${server.baseUrl}/api/v1/admin/financial/wallet-top-up-reconciliations/missing/retry`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tokens.admin}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING,
                    adminUserId: actors.userId.toString(),
                }),
            });
            strict_1.default.equal(spoofed.status, 400);
            const missing = await fetch(`${server.baseUrl}/api/v1/admin/financial/wallet-top-up-reconciliations/does-not-exist/retry`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tokens.admin}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RETRY_ACCOUNTING }),
            });
            strict_1.default.equal(missing.status, 404);
            const errorBody = await missing.json();
            strict_1.default.equal("stack" in errorBody, false);
            strict_1.default.equal("fingerprint" in errorBody, false);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase7h audit persistence: inspect, acknowledge, and resolve use authenticated actor", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const valid = await (0, topUpFixtures_1.createFundedTopUp)(actors, 895);
        await (0, topUpFixtures_1.completeFundedTopUp)(valid.request.topUpReference);
        const validInspection = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspect(valid.request.topUpReference, actors.adminId.toString());
        await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.updateStatus({
            reconciliationReference: validInspection.reconciliationReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION,
            resolutionCode: "PHASE7H_VALIDATED",
            adminUserId: actors.adminId.toString(),
        });
        const corrupted = await (0, topUpFixtures_1.createFundedTopUp)(actors, 896);
        await (0, topUpFixtures_1.completeFundedTopUp)(corrupted.request.topUpReference);
        await walletTopUpRequest_model_1.WalletTopUpRequest.collection.updateOne({ _id: corrupted.request._id }, { $unset: { completedAt: "", accountingCompletedAt: "" } });
        const corruptedInspection = await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.inspect(corrupted.request.topUpReference, actors.adminId.toString());
        await walletTopUpReconciliation_service_1.walletTopUpReconciliationService.updateStatus({
            reconciliationReference: corruptedInspection.reconciliationReference,
            action: walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
            resolutionCode: "PHASE7H_ACKNOWLEDGED",
            adminUserId: actors.adminId.toString(),
        });
        const audits = await walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.find({
            action: {
                $in: [
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.INSPECT,
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.RESOLVE_RECONCILIATION,
                    walletTopUpOperationalAction_enum_1.WalletTopUpOperationalAction.ACKNOWLEDGE_CORRUPTION,
                ],
            },
        }).select("+actorId");
        strict_1.default.ok(audits.length >= 4);
        strict_1.default.ok(audits.every((audit) => audit.actorId?.equals(actors.adminId)));
        strict_1.default.ok(audits.every((audit) => audit.createdAt instanceof Date));
        strict_1.default.ok(audits.every((audit) => !JSON.stringify(audit.toObject()).match(/password|authorization|stack|rawProvider/i)));
    });
};
exports.registerBookingAndAuthorizationTests = registerBookingAndAuthorizationTests;
