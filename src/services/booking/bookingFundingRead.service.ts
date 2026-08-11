import { Types } from "mongoose";

import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { Slot } from "../../models/slot.model";
import { UserProfile } from "../../models/userProfile.model";
import User from "../../models/User";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentPricingPolicy } from "../../enums/financial/paymentPricingPolicy.enum";
import { bookingRepository } from "../../repositories/booking.repository";
import { bookingFundReservationRepository } from "../../repositories/bookingFundReservation.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { marketplacePricingService } from "../financial/marketplacePricing.service";
import { creatorServiceMajorToMinor } from "../../utils/financial/creatorServicePrice.util";
import { resolveAccountGovernance } from "../accountGovernance/accountGovernanceResolver.service";
import type {
  BookingFundingResponseDto,
  BookingPricingPreviewResponseDto,
} from "../../dtos/booking/bookingFunding.response.dto";

export class BookingFundingReadService {
  private requireObjectId(value: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new Error(`Invalid ${label}`);
    return new Types.ObjectId(value);
  }

  async preview(input: {
    authenticatedUserId: string;
    serviceId: string;
    slotIds: string[];
  }): Promise<BookingPricingPreviewResponseDto> {
    const userId = this.requireObjectId(input.authenticatedUserId, "authenticated user");
    const serviceId = this.requireObjectId(input.serviceId, "serviceId");
    if (!Array.isArray(input.slotIds) || input.slotIds.length === 0) {
      throw new Error("slotIds are required");
    }
    const slotIds = input.slotIds.map((slotId) => this.requireObjectId(slotId, "slotIds"));

    const [user, profile, service] = await Promise.all([
      User.findById(userId).exec(),
      UserProfile.findOne({ userId }).exec(),
      CreatorService.findById(serviceId).exec(),
    ]);
    if (!user) throw new Error("Authenticated user not found.");
    if (!profile || profile.profileStatus !== "verified") {
      throw new Error("Profile verification required.");
    }
    if (resolveAccountGovernance(user).blocksOutgoingBookings) {
      throw new Error("Your account is currently restricted from creating new bookings.");
    }
    if (!service) throw new Error("Service not found");
    if (!service.isActive) throw new Error("Service is not active");
    if (service.creatorId.toString() === userId.toString()) {
      throw new Error("You cannot book your own service");
    }

    const creatorProfile = await CreatorProfile.findOne({ userId: service.creatorId }).exec();
    if (!creatorProfile || creatorProfile.status !== "active") {
      throw new Error("Creator is not active");
    }
    const currency = creatorProfile.currency as SupportedCurrency;
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new Error("Creator currency is not supported for payments");
    }

    const slots = await Slot.find({
      _id: { $in: slotIds }, serviceId: service._id, status: "AVAILABLE",
    }).exec();
    if (slots.length !== slotIds.length) throw new Error("One or more slots not available");
    if (slots.some((slot) => slot.startTime.getTime() < Date.now())) {
      throw new Error("Cannot book expired slots");
    }
    const totalMinutes = slots.reduce(
      (sum, slot) => sum + (slot.endTime.getTime() - slot.startTime.getTime()) / 60_000,
      0,
    );
    if (totalMinutes < service.durationMinutes || totalMinutes % service.durationMinutes !== 0) {
      throw new Error(`Slots must be in multiples of ${service.durationMinutes} minutes`);
    }
    const pricing = marketplacePricingService.calculate({
      serviceAmount: slots.reduce((sum, slot) => sum +
        creatorServiceMajorToMinor(slot.price, currency), 0), currency,
    });
    const wallet = await walletRepository.findByUserAndCurrency(userId, currency);
    const availableAmount = wallet?.availableBalance ?? 0;
    return {
      currency,
      serviceAmount: pricing.serviceAmount,
      customerFeeAmount: pricing.platformFeeAmount,
      grossFundingAmount: pricing.totalAmount,
      pricingPolicy: PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1,
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

  async getFunding(input: {
    authenticatedUserId: string;
    bookingId: string;
  }): Promise<BookingFundingResponseDto> {
    const userId = this.requireObjectId(input.authenticatedUserId, "authenticated user");
    const bookingId = this.requireObjectId(input.bookingId, "bookingId");
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId.toString() !== userId.toString() && booking.creatorId.toString() !== userId.toString()) {
      throw new Error("You are not allowed to view this booking funding.");
    }
    const payment = booking.paymentId ? await paymentRepository.findById(booking.paymentId) : null;
    const reservation = payment && payment.method === PaymentMethod.WALLET
      ? await bookingFundReservationRepository.findByBooking(booking._id as Types.ObjectId)
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
      } : { state: payment?.method === PaymentMethod.WALLET ? "UNAVAILABLE" : "NOT_APPLICABLE" },
    };
  }
}

export const bookingFundingReadService = new BookingFundingReadService();
