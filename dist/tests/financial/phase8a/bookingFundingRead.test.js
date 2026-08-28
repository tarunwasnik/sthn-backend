"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingFundingReadTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const registerBookingFundingReadTests = () => {
    (0, node_test_1.test)("phase7a pricing preview is read-only and reports authoritative Wallet readiness", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 1000 });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const before = await Promise.all([
                booking_model_1.Booking.countDocuments(), payment_model_1.Payment.countDocuments(), bookingFundReservation_model_1.BookingFundReservation.countDocuments(),
                ledgerEntry_model_1.LedgerEntry.countDocuments(), walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
            ]);
            const response = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
                body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 200);
            strict_1.default.equal(body.preview.serviceAmount, fixture.serviceAmount);
            strict_1.default.equal(body.preview.customerFeeAmount, fixture.platformFeeAmount);
            strict_1.default.equal(body.preview.grossFundingAmount, fixture.totalAmount);
            strict_1.default.equal(body.preview.walletFunding.sufficient, true);
            strict_1.default.deepEqual(await Promise.all([
                booking_model_1.Booking.countDocuments(), payment_model_1.Payment.countDocuments(), bookingFundReservation_model_1.BookingFundReservation.countDocuments(),
                ledgerEntry_model_1.LedgerEntry.countDocuments(), walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
            ]), before);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase7a funding read is participant-only and exposes no financial identifiers", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)();
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const created = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase7a-funding-read");
            strict_1.default.equal(created.status, 201);
            const booking = await booking_model_1.Booking.findOne({ bookingReference: created.body.booking.bookingReference }).orFail();
            const response = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
                headers: { authorization: `Bearer ${fixture.token}` },
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 200);
            strict_1.default.equal(body.funding.walletFunding.state, "ACTIVE");
            strict_1.default.equal(JSON.stringify(body).includes("walletId"), false);
            strict_1.default.equal(JSON.stringify(body).includes("reservationId"), false);
            const creatorToken = jsonwebtoken_1.default.sign({ id: fixture.actors.creatorId.toString(), role: "user" }, process.env.JWT_SECRET);
            const creatorRead = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
                headers: { authorization: `Bearer ${creatorToken}` },
            });
            strict_1.default.equal(creatorRead.status, 200);
            const unrelated = await (0, topUpFixtures_1.createActors)();
            const deniedToken = jsonwebtoken_1.default.sign({ id: unrelated.userId.toString(), role: "user" }, process.env.JWT_SECRET);
            const denied = await fetch(`${server.baseUrl}/api/v1/bookings/${booking._id}/funding`, {
                headers: { authorization: `Bearer ${deniedToken}` },
            });
            strict_1.default.equal(denied.status, 403);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("creator major-unit USD prices preserve their exact money in preview and Wallet reservation", async () => {
        const cases = [
            { price: 1000, serviceAmount: 100000, feeAmount: 5000, grossAmount: 105000 },
            { price: 1100.99, serviceAmount: 110099, feeAmount: 5505, grossAmount: 115604 },
            { price: 12.34, serviceAmount: 1234, feeAmount: 62, grossAmount: 1296 },
            { price: 14331, serviceAmount: 1433100, feeAmount: 71655, grossAmount: 1504755 },
        ];
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            for (const [index, expected] of cases.entries()) {
                const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
                    walletAmount: 0,
                    currency: "USD",
                    slotPricesMajor: [expected.price],
                });
                await wallet_model_1.Wallet.create({
                    userId: fixture.actors.userId,
                    currency: "USD",
                    availableBalance: expected.grossAmount + 1,
                    currentBalance: expected.grossAmount + 1,
                });
                const preview = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
                    method: "POST",
                    headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
                    body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
                });
                const previewBody = await preview.json();
                strict_1.default.equal(preview.status, 200, JSON.stringify(previewBody));
                strict_1.default.equal(previewBody.preview.serviceAmount, expected.serviceAmount);
                strict_1.default.equal(previewBody.preview.customerFeeAmount, expected.feeAmount);
                strict_1.default.equal(previewBody.preview.grossFundingAmount, expected.grossAmount);
                strict_1.default.equal(previewBody.preview.walletFunding.sufficient, true);
                if (index !== 0)
                    continue;
                const created = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "creator-price-usd-1000");
                strict_1.default.equal(created.status, 201, JSON.stringify(created.body));
                const payment = await payment_model_1.Payment.findOne({ paymentReference: created.body.payment.paymentReference }).orFail();
                const reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({
                    reservationReference: created.body.reservation.reservationReference,
                }).orFail();
                strict_1.default.equal(payment.serviceAmount, expected.serviceAmount);
                strict_1.default.equal(payment.amount, expected.grossAmount);
                strict_1.default.equal(reservation.amount, expected.grossAmount);
            }
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("creator major-unit USD price requires the true Wallet funding amount", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
            walletAmount: 0,
            currency: "USD",
            slotPricesMajor: [1000],
        });
        await wallet_model_1.Wallet.create({ userId: fixture.actors.userId, currency: "USD", availableBalance: 50000, currentBalance: 50000 });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const preview = await fetch(`${server.baseUrl}/api/v1/bookings/pricing-preview`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${fixture.token}` },
                body: JSON.stringify({ serviceId: fixture.serviceId.toString(), slotIds: fixture.slotIds.map(String) }),
            });
            const previewBody = await preview.json();
            strict_1.default.equal(preview.status, 200, JSON.stringify(previewBody));
            strict_1.default.equal(previewBody.preview.serviceAmount, 100000);
            strict_1.default.equal(previewBody.preview.walletFunding.sufficient, false);
            const created = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "creator-price-usd-insufficient");
            strict_1.default.equal(created.status, 409, JSON.stringify(created.body));
            strict_1.default.equal(await payment_model_1.Payment.countDocuments(), 0);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingFundingReadTests = registerBookingFundingReadTests;
