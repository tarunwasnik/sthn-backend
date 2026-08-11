"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingWalletReservationFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const slot_model_1 = require("../../../models/slot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const assertNoBookingEffect = async () => {
    strict_1.default.equal(await booking_model_1.Booking.countDocuments(), 0);
    strict_1.default.equal(await payment_model_1.Payment.countDocuments(), 0);
    strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), 0);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_AUTHORIZATION,
    }), 0);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
        "deltas.reservedBalance": { $gt: 0 },
    }), 0);
};
const registerBookingWalletReservationFailureTests = () => {
    (0, node_test_1.test)("phase8a balance: exact available balance succeeds and reaches zero", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 420, slotAmounts: [400] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-exact");
            strict_1.default.equal(response.status, 201, JSON.stringify(response.body));
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 0);
            strict_1.default.equal(wallet.reservedBalance, 420);
            strict_1.default.equal(wallet.currentBalance, 420);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a balance: below-amount available balance fails with zero effects", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 399, slotAmounts: [400] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-insufficient");
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_RESERVATION_INSUFFICIENT_AVAILABLE_BALANCE");
            await assertNoBookingEffect();
            strict_1.default.equal((await slot_model_1.Slot.findById(fixture.slotIds[0]).orFail()).status, "AVAILABLE");
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 399);
            strict_1.default.equal(wallet.reservedBalance, 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a balance: reserved and locked value is never spendable", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 500, slotAmounts: [150] });
        await wallet_model_1.Wallet.updateOne({ _id: fixture.actors.wallet._id }, {
            $set: {
                availableBalance: 100,
                reservedBalance: 200,
                lockedBalance: 200,
                currentBalance: 500,
            },
        });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-nonspendable");
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            await assertNoBookingEffect();
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 100);
            strict_1.default.equal(wallet.reservedBalance, 200);
            strict_1.default.equal(wallet.lockedBalance, 200);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a currency: server booking currency mismatch fails without conversion", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
            walletAmount: 500,
            slotAmounts: [200],
            currency: "USD",
        });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-currency");
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_RESERVATION_CURRENCY_CONFLICT");
            await assertNoBookingEffect();
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a authority: client financial overrides are rejected before mutation", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 500, slotAmounts: [200] });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-client-override", { amount: 1, currency: "USD", walletId: fixture.actors.wallet._id.toString() });
            strict_1.default.equal(response.status, 422);
            await assertNoBookingEffect();
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a rollback: a projection-stage failure rolls back slots, booking, payment, reservation, and Ledger", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 500, slotAmounts: [200] });
        const original = walletProjection_service_1.walletProjectionService.applyProjectionMutation;
        walletProjection_service_1.walletProjectionService.applyProjectionMutation = async () => {
            throw new Error("controlled projection failure");
        };
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-rollback");
            strict_1.default.equal(response.status, 409, JSON.stringify(response.body));
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_RESERVATION_PROJECTION_CONFLICT");
            await assertNoBookingEffect();
            strict_1.default.equal((await slot_model_1.Slot.findById(fixture.slotIds[0]).orFail()).status, "AVAILABLE");
            const wallet = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).orFail();
            strict_1.default.equal(wallet.availableBalance, 500);
            strict_1.default.equal(wallet.reservedBalance, 0);
        }
        finally {
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8a slot conflict: unavailable slot leaves no booking or financial effect", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 500, slotAmounts: [200] });
        await slot_model_1.Slot.updateOne({ _id: fixture.slotIds[0] }, { $set: { status: "CANCELLED" } });
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const response = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "phase8a-slot-conflict");
            strict_1.default.equal(response.status, 409);
            strict_1.default.equal(response.body.code, "BOOKING_WALLET_RESERVATION_BOOKING_CONFLICT");
            await assertNoBookingEffect();
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingWalletReservationFailureTests = registerBookingWalletReservationFailureTests;
