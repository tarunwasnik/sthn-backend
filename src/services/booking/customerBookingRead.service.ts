import { Types } from "mongoose";

import { Booking } from "../../models/booking.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorService } from "../../models/creatorService.model";
import { Slot } from "../../models/slot.model";

export class CustomerBookingReadError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

/** Read-only, ownership-scoped detail projection for the authenticated Customer. */
export class CustomerBookingReadService {
  async getById(input: { bookingId: string; customerId: string }) {
    if (!Types.ObjectId.isValid(input.bookingId)) {
      throw new CustomerBookingReadError("Invalid bookingId", 400);
    }

    const booking = await Booking.findOne({
      _id: new Types.ObjectId(input.bookingId),
      userId: new Types.ObjectId(input.customerId),
    }).lean();

    // Return a non-enumerating response for records the Customer does not own.
    if (!booking) throw new CustomerBookingReadError("Booking not found", 404);

    const [slots, creator, service] = await Promise.all([
      Slot.find({ _id: { $in: booking.slotIds } }).sort({ startTime: 1 }).lean(),
      CreatorProfile.findOne({ userId: booking.creatorId }).lean(),
      CreatorService.findById(booking.serviceId).lean(),
    ]);

    return {
      _id: booking._id,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      price: booking.price,
      serviceAmount: booking.serviceAmount,
      platformFeeAmount: booking.platformFeeAmount,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      durationMinutes: booking.durationMinutes,
      expiresAt: booking.expiresAt,
      createdAt: booking.createdAt,
      completedAt: booking.completedAt,
      service: {
        _id: booking.serviceId,
        title: booking.serviceTitle,
        snapshot: booking.serviceSnapshot ?? null,
        data: service ?? null,
      },
      creator: {
        _id: booking.creatorId,
        profile: creator ?? null,
      },
      slots: slots.map((slot) => ({
        _id: slot._id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        price: slot.price,
      })),
    };
  }
}

export const customerBookingReadService = new CustomerBookingReadService();
