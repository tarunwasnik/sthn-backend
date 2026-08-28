"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingFundingReadService = exports.BookingFundingReadService = void 0;
const mongoose_1 = require("mongoose");
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const creatorService_model_1 = require("../../models/creatorService.model");
const slot_model_1 = require("../../models/slot.model");
const userProfile_model_1 = require("../../models/userProfile.model");
const User_1 = __importDefault(require("../../models/User"));
const paymentMethod_enum_1 = require("../../enums/financial/paymentMethod.enum");
const paymentPricingPolicy_enum_1 = require("../../enums/financial/paymentPricingPolicy.enum");
const booking_repository_1 = require("../../repositories/booking.repository");
const bookingFundReservation_repository_1 = require("../../repositories/bookingFundReservation.repository");
const payment_repository_1 = require("../../repositories/payment.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const supportedCurrencies_1 = require("../../constants/financial/supportedCurrencies");
const marketplacePricing_service_1 = require("../financial/marketplacePricing.service");
const creatorServicePrice_util_1 = require("../../utils/financial/creatorServicePrice.util");
const accountGovernanceResolver_service_1 = require("../accountGovernance/accountGovernanceResolver.service");
class BookingFundingReadService {
    requireObjectId(value, label) {
        if (!mongoose_1.Types.ObjectId.isValid(value))
            throw new Error(`Invalid ${label}`);
        return new mongoose_1.Types.ObjectId(value);
    }
    async preview(input) {
        const userId = this.requireObjectId(input.authenticatedUserId, "authenticated user");
        const serviceId = this.requireObjectId(input.serviceId, "serviceId");
        if (!Array.isArray(input.slotIds) || input.slotIds.length === 0) {
            throw new Error("slotIds are required");
        }
        const slotIds = input.slotIds.map((slotId) => this.requireObjectId(slotId, "slotIds"));
        const [user, profile, service] = await Promise.all([
            User_1.default.findById(userId).exec(),
            userProfile_model_1.UserProfile.findOne({ userId }).exec(),
            creatorService_model_1.CreatorService.findById(serviceId).exec(),
        ]);
        if (!user)
            throw new Error("Authenticated user not found.");
        if (!profile || profile.profileStatus !== "verified") {
            throw new Error("Profile verification required.");
        }
        if ((0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user).blocksOutgoingBookings) {
            throw new Error("Your account is currently restricted from creating new bookings.");
        }
        if (!service)
            throw new Error("Service not found");
        if (!service.isActive)
            throw new Error("Service is not active");
        if (service.creatorId.toString() === userId.toString()) {
            throw new Error("You cannot book your own service");
        }
        const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: service.creatorId }).exec();
        if (!creatorProfile || creatorProfile.status !== "active") {
            throw new Error("Creator is not active");
        }
        const currency = creatorProfile.currency;
        if (!supportedCurrencies_1.SUPPORTED_CURRENCIES.includes(currency)) {
            throw new Error("Creator currency is not supported for payments");
        }
        const slots = await slot_model_1.Slot.find({
            _id: { $in: slotIds }, serviceId: service._id, status: "AVAILABLE",
        }).exec();
        if (slots.length !== slotIds.length)
            throw new Error("One or more slots not available");
        if (slots.some((slot) => slot.startTime.getTime() < Date.now())) {
            throw new Error("Cannot book expired slots");
        }
        const totalMinutes = slots.reduce((sum, slot) => sum + (slot.endTime.getTime() - slot.startTime.getTime()) / 60000, 0);
        if (totalMinutes < service.durationMinutes || totalMinutes % service.durationMinutes !== 0) {
            throw new Error(`Slots must be in multiples of ${service.durationMinutes} minutes`);
        }
        const pricing = marketplacePricing_service_1.marketplacePricingService.calculate({
            serviceAmount: slots.reduce((sum, slot) => sum +
                (0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(slot.price, currency), 0), currency,
        });
        const wallet = await wallet_repository_1.walletRepository.findByUserAndCurrency(userId, currency);
        const availableAmount = wallet?.availableBalance ?? 0;
        return {
            currency,
            serviceAmount: pricing.serviceAmount,
            customerFeeAmount: pricing.platformFeeAmount,
            grossFundingAmount: pricing.totalAmount,
            pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1,
            pricingVersion: 1,
            walletFunding: {
                currency,
                availableAmount,
                requiredAmount: pricing.totalAmount,
                walletExists: Boolean(wallet),
                sufficient: availableAmount >= pricing.totalAmount,
            },
        };
    }
    async getFunding(input) {
        const userId = this.requireObjectId(input.authenticatedUserId, "authenticated user");
        const bookingId = this.requireObjectId(input.bookingId, "bookingId");
        const booking = await booking_repository_1.bookingRepository.findById(bookingId);
        if (!booking)
            throw new Error("Booking not found");
        if (booking.userId.toString() !== userId.toString() && booking.creatorId.toString() !== userId.toString()) {
            throw new Error("You are not allowed to view this booking funding.");
        }
        const payment = booking.paymentId ? await payment_repository_1.paymentRepository.findById(booking.paymentId) : null;
        const reservation = payment && payment.method === paymentMethod_enum_1.PaymentMethod.WALLET
            ? await bookingFundReservation_repository_1.bookingFundReservationRepository.findByBooking(booking._id)
            : null;
        return {
            booking: { status: booking.status, currency: booking.currency },
            pricing: {
                serviceAmount: booking.serviceAmount,
                customerFeeAmount: booking.platformFeeAmount,
                grossFundingAmount: booking.totalAmount,
                pricingPolicy: payment?.pricingPolicy ?? null,
                pricingVersion: payment?.pricingVersion ?? null,
            },
            payment: payment ? {
                method: payment.method,
                status: payment.status,
                ...(payment.authorizedAt ? { authorizedAt: payment.authorizedAt } : {}),
                ...(payment.releasedAt ? { releasedAt: payment.releasedAt } : {}),
                ...(payment.capturedAt ? { capturedAt: payment.capturedAt } : {}),
            } : null,
            walletFunding: reservation ? {
                state: reservation.status,
                amount: reservation.amount,
                currency: reservation.currency,
                ...(reservation.authorizedAt ? { authorizedAt: reservation.authorizedAt } : {}),
                ...(reservation.releasedAt ? { releasedAt: reservation.releasedAt } : {}),
                ...(reservation.capturedAt ? { capturedAt: reservation.capturedAt } : {}),
            } : { state: payment?.method === paymentMethod_enum_1.PaymentMethod.WALLET ? "UNAVAILABLE" : "NOT_APPLICABLE" },
        };
    }
}
exports.BookingFundingReadService = BookingFundingReadService;
exports.bookingFundingReadService = new BookingFundingReadService();
