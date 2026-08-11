"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingEscrowAllocationRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const booking_model_1 = require("../../../models/booking.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const bookingWalletFixtures_1 = require("../phase8a/fixtures/bookingWalletFixtures");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const bookingWalletReleaseFixtures_1 = require("../phase8b/fixtures/bookingWalletReleaseFixtures");
const bookingWalletCaptureFixtures_1 = require("../phase8c/fixtures/bookingWalletCaptureFixtures");
const bookingEscrowAllocationFixtures_1 = require("./fixtures/bookingEscrowAllocationFixtures");
const expectCode = async (operation, code) => {
    await strict_1.default.rejects(operation, (error) => {
        strict_1.default.equal(error?.code, code, String(error));
        return true;
    });
};
const registerBookingEscrowAllocationRegressionTests = () => {
    (0, node_test_1.test)("phase8d Phase 8C capture remains complete before explicit allocation", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            strict_1.default.equal(captured.booking.status, "COMPLETED");
            strict_1.default.equal(captured.payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.equal(captured.reservation.status, "CAPTURED");
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: captured.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d INTERNAL-provider booking remains outside escrow allocation", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                walletAmount: 0,
                slotAmounts: [1000],
            });
            const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${fixture.token}`,
                },
                body: JSON.stringify({
                    serviceId: fixture.serviceId.toString(),
                    slotIds: fixture.slotIds.map(String),
                    paymentMethod: paymentMethod_enum_1.PaymentMethod.INTERNAL,
                }),
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 201, JSON.stringify(body));
            const booking = await booking_model_1.Booking.findOne({
                bookingReference: body.booking.bookingReference,
            }).orFail();
            const creatorToken = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
            const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT");
            strict_1.default.equal(accepted.status, 200, JSON.stringify(accepted.body));
            await (0, bookingWalletCaptureFixtures_1.enableBookingCompletion)(fixture.actors.adminId.toString());
            const completed = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
            strict_1.default.equal(completed.status, 200, JSON.stringify(completed.body));
            const payment = await payment_model_1.Payment.findById(booking.paymentId).orFail();
            strict_1.default.equal(payment.method, paymentMethod_enum_1.PaymentMethod.INTERNAL);
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({
                paymentId: payment._id,
            }), 1);
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_RESERVATION_NOT_FOUND");
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({
                bookingId: booking._id,
            }), 0);
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d top-up records cannot be allocated as captured Bookings", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 1000);
        const walletBefore = await wallet_model_1.Wallet.findById(actors.wallet._id).orFail();
        await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(request._id.toString()), "BOOKING_ESCROW_ALLOCATION_BOOKING_NOT_FOUND");
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({
            topUpRequestId: request._id,
        }), 1);
        strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 0);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
        }), 0);
        const walletAfter = await wallet_model_1.Wallet.findById(actors.wallet._id).orFail();
        strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
        strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
    });
    (0, node_test_1.test)("phase8d allocation authority indexes exist in MongoDB", async () => {
        const indexes = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.collection.indexes();
        for (const field of [
            "allocationReference",
            "allocationKey",
            "bookingId",
            "paymentId",
            "reservationId",
            "escrowLedgerTransaction",
            "allocationLedgerTransaction",
        ]) {
            const index = indexes.find((candidate) => candidate.key[field] === 1);
            strict_1.default.ok(index, `${field} index is missing`);
            strict_1.default.equal(index.unique, true);
        }
        strict_1.default.ok(indexes.find((candidate) => candidate.key.creatorId === 1 && candidate.key.status === 1));
        strict_1.default.ok(indexes.find((candidate) => candidate.key.status === 1 && candidate.key.allocatedAt === -1));
    });
};
exports.registerBookingEscrowAllocationRegressionTests = registerBookingEscrowAllocationRegressionTests;
