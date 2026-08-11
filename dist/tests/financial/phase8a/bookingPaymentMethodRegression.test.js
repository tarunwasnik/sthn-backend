"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingPaymentMethodRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const payment_model_1 = require("../../../models/payment.model");
const paymentMethod_enum_1 = require("../../../enums/financial/paymentMethod.enum");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const registerBookingPaymentMethodRegressionTests = () => {
    (0, node_test_1.test)("phase8a regression: Internal Provider booking still creates InternalPayment", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 0, slotAmounts: [200] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
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
            const payment = await payment_model_1.Payment.findOne({ bookingId: body.booking._id }).orFail();
            strict_1.default.equal(payment.method, paymentMethod_enum_1.PaymentMethod.INTERNAL);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({ paymentId: payment._id }), 1);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({ paymentId: payment._id }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a regression: top-up and Wallet booking lifecycle records remain separate", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 300);
        await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), 1);
        strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), 0);
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 500, slotAmounts: [200] });
        const fundingCountBeforeBooking = await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments();
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-boundary");
            strict_1.default.equal(response.status, 201, JSON.stringify(response.body));
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), 1);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), fundingCountBeforeBooking);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingPaymentMethodRegressionTests = registerBookingPaymentMethodRegressionTests;
