"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingServiceSnapshotTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const booking_model_1 = require("../../../models/booking.model");
const creatorService_model_1 = require("../../../models/creatorService.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const wallet_model_1 = require("../../../models/wallet.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const bookingWalletFixtures_1 = require("./fixtures/bookingWalletFixtures");
const registerBookingServiceSnapshotTests = () => {
    (0, node_test_1.test)("DI-2A persists authoritative immutable CreatorService evidence without changing booking funding", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 2000 });
        const service = await creatorService_model_1.CreatorService.findById(fixture.serviceId).orFail();
        service.title = "Original service title";
        service.description = "Original public service scope";
        service.durationMinutes = 30;
        service.price = 12.34;
        service.currency = "INR";
        service.media = ["https://media.example/original.jpg"];
        await service.save();
        const before = await Promise.all([
            payment_model_1.Payment.countDocuments(),
            bookingFundReservation_model_1.BookingFundReservation.countDocuments(),
            ledgerEntry_model_1.LedgerEntry.countDocuments(),
        ]);
        const server = await (0, bookingWalletFixtures_1.startBookingHttpServer)();
        try {
            const created = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, fixture, "di-2a-authoritative", {
                serviceSnapshot: {
                    title: "Client supplied title must be ignored",
                    description: "Client supplied evidence must be ignored",
                    price: 999999,
                    media: ["https://media.example/untrusted.jpg"],
                },
            });
            strict_1.default.equal(created.status, 201, JSON.stringify(created.body));
            const booking = await booking_model_1.Booking.findOne({
                bookingReference: created.body.booking.bookingReference,
            }).orFail();
            const snapshot = booking.serviceSnapshot;
            strict_1.default.ok(snapshot);
            strict_1.default.equal(String(snapshot.serviceId), String(service._id));
            strict_1.default.equal(snapshot.title, "Original service title");
            strict_1.default.equal(snapshot.description, "Original public service scope");
            strict_1.default.equal(snapshot.durationMinutes, 30);
            strict_1.default.equal(snapshot.price, 12.34);
            strict_1.default.equal(snapshot.currency, "INR");
            strict_1.default.deepEqual(snapshot.media, ["https://media.example/original.jpg"]);
            strict_1.default.equal(booking.serviceTitle, "Original service title");
            strict_1.default.equal(booking.currency, "INR");
            service.title = "Edited after booking";
            service.description = "Edited after booking";
            service.durationMinutes = 60;
            service.price = 99.99;
            service.media = ["https://media.example/edited.jpg"];
            await service.save();
            const reread = await booking_model_1.Booking.findById(booking._id).orFail();
            strict_1.default.equal(reread.serviceSnapshot?.title, snapshot.title);
            strict_1.default.equal(reread.serviceSnapshot?.description, snapshot.description);
            strict_1.default.equal(reread.serviceSnapshot?.durationMinutes, snapshot.durationMinutes);
            strict_1.default.equal(reread.serviceSnapshot?.price, snapshot.price);
            strict_1.default.equal(reread.serviceSnapshot?.currency, snapshot.currency);
            strict_1.default.deepEqual(reread.serviceSnapshot?.media, snapshot.media);
            strict_1.default.equal(await payment_model_1.Payment.countDocuments(), before[0] + 1);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments(), before[1] + 1);
            strict_1.default.ok(await ledgerEntry_model_1.LedgerEntry.countDocuments() > before[2]);
            const wallet = await wallet_model_1.Wallet.findOne({ userId: fixture.actors.userId, currency: "INR" }).orFail();
            strict_1.default.equal(wallet.reservedBalance, fixture.totalAmount);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("DI-2A leaves legacy bookings without a fabricated service snapshot", async () => {
        const fixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({ walletAmount: 2000 });
        const created = await booking_model_1.Booking.create({
            slotIds: fixture.slotIds,
            userId: fixture.actors.userId,
            creatorId: fixture.actors.creatorId,
            serviceId: fixture.serviceId,
            serviceTitle: "Legacy copied title",
            durationMinutes: 30,
            price: fixture.amount,
            serviceAmount: fixture.serviceAmount,
            platformFeeAmount: fixture.platformFeeAmount,
            commissionAmount: fixture.commissionAmount,
            creatorAmount: fixture.creatorAmount,
            totalAmount: fixture.totalAmount,
            currency: "INR",
            status: "REQUESTED",
            paymentStatus: "PENDING",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
        const legacy = await booking_model_1.Booking.findById(created._id).orFail();
        strict_1.default.equal(legacy.serviceSnapshot, undefined);
        strict_1.default.equal(legacy.serviceTitle, "Legacy copied title");
    });
};
exports.registerBookingServiceSnapshotTests = registerBookingServiceSnapshotTests;
