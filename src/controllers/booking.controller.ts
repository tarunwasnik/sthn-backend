// backend/src/controllers/booking.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Slot } from "../models/slot.model";
import { Booking } from "../models/booking.model";
import { Dispute } from "../models/dispute.model";
import { UserProfile } from "../models/userProfile.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { CreatorService } from "../models/creatorService.model";

/* =========================================================
   CLEANUP EXPIRED BOOKINGS
========================================================= */

const cleanupExpiredBookings = async (
  creatorId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
) => {
  const expiredBookings = await Booking.find({
    creatorId,
    status: "REQUESTED",
    expiresAt: { $lt: new Date() },
  }).session(session);

  for (const booking of expiredBookings) {
    await Slot.updateMany(
      {
        _id: { $in: booking.slotIds },
        status: "LOCKED",
      },
      { status: "AVAILABLE" },
      { session }
    );

    booking.status = "EXPIRED";
    await booking.save({ session });
  }
};

/* =========================================================
   GET USER BOOKINGS  ✅ NEW
========================================================= */

export const getUserBookings = async (
  req: Request,
  res: Response
) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const bookings = await Booking.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .lean();

    const bookingIds = bookings.map((b) => b._id);

    const allSlotIds = bookings.flatMap((b) => b.slotIds);

    const slots = await Slot.find({
      _id: { $in: allSlotIds },
    })
      .sort({ startTime: 1 })
      .lean();

    const slotMap = new Map(
      slots.map((slot) => [String(slot._id), slot])
    );

    const creatorIds = [
      ...new Set(bookings.map((b) => String(b.creatorId))),
    ];

    const creators = await CreatorProfile.find({
      userId: { $in: creatorIds },
    }).lean();

    const creatorMap = new Map(
      creators.map((c) => [String(c.userId), c])
    );

    const serviceIds = [
      ...new Set(bookings.map((b) => String(b.serviceId))),
    ];

    const services = await CreatorService.find({
      _id: { $in: serviceIds },
    }).lean();

    const serviceMap = new Map(
      services.map((s) => [String(s._id), s])
    );

    const formatted = bookings.map((booking) => {
      const bookingSlots = booking.slotIds
        .map((id) => slotMap.get(String(id)))
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(a!.startTime).getTime() -
            new Date(b!.startTime).getTime()
        );

      return {
        _id: booking._id,

        status: booking.status,
        paymentStatus: booking.paymentStatus,

        price: booking.price,
        currency: booking.currency,
        durationMinutes: booking.durationMinutes,

        expiresAt: booking.expiresAt,
        createdAt: booking.createdAt,

        service: {
          _id: booking.serviceId,
          title: booking.serviceTitle,
          data: serviceMap.get(String(booking.serviceId)) || null,
        },

        creator: {
          _id: booking.creatorId,
          profile: creatorMap.get(String(booking.creatorId)) || null,
        },

        slots: bookingSlots.map((slot) => ({
          _id: slot!._id,
          startTime: slot!.startTime,
          endTime: slot!.endTime,
          status: slot!.status,
          price: slot!.price,
        })),
      };
    });

    return res.status(200).json({
      bookings: formatted,
    });

  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch bookings",
    });
  }
};

/* =========================================================
   REQUEST BOOKING
========================================================= */

export const requestBooking = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { serviceId, slotIds } = req.body;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (user.status !== "active") {
    return res.status(403).json({ message: "Account is not active." });
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({ message: "Invalid serviceId" });
  }

  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    return res.status(400).json({ message: "slotIds are required" });
  }

  if (!slotIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ message: "Invalid slotIds" });
  }

  const profile = await UserProfile.findOne({ userId: user.id });

  if (!profile) {
    return res.status(403).json({
      message: "You must complete your profile before booking.",
    });
  }

  if (profile.profileStatus !== "verified") {
  let message = "Profile verification required.";

  if (profile.profileStatus === "pending_verification") {
    message = "Your profile is under verification.";
  }

  if (profile.profileStatus === "rejected") {
    message = "Your profile was rejected. Please update and resubmit.";
  }

  return res.status(403).json({ message });
}

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const service = await CreatorService.findById(serviceId).session(session);

    if (!service) throw new Error("Service not found");
    if (!service.isActive) throw new Error("Service is not active");

    const creatorId = service.creatorId;

    if (String(creatorId) === String(user.id)) {
      throw new Error("You cannot book your own service");
    }

    const creatorProfile = await CreatorProfile.findOne({
      userId: creatorId,
    }).session(session);

    if (!creatorProfile) throw new Error("Creator profile not found");
    if (creatorProfile.status !== "active")
      throw new Error("Creator is not active");

    await cleanupExpiredBookings(
      new mongoose.Types.ObjectId(creatorId),
      session
    );

    const slots = await Slot.find({
      _id: { $in: slotIds },
      status: "AVAILABLE",
      serviceId: service._id,
    }).session(session);

    if (slots.length !== slotIds.length)
      throw new Error("One or more slots not available");

    const totalMinutes = slots.reduce((sum, slot) => {
      const duration =
        (slot.endTime.getTime() - slot.startTime.getTime()) /
        (1000 * 60);
      return sum + duration;
    }, 0);

    if (
      totalMinutes < service.durationMinutes ||
      totalMinutes % service.durationMinutes !== 0
    ) {
      throw new Error(
        `Slots must be in multiples of ${service.durationMinutes} minutes`
      );
    }

    const existingRequest = await Booking.findOne({
      slotIds: { $in: slotIds },
      status: "REQUESTED",
      expiresAt: { $gt: new Date() },
    }).session(session);

    if (existingRequest) {
      throw new Error("This slot is already requested by another user");
    }

    const lockResult = await Slot.updateMany(
      {
        _id: { $in: slotIds },
        status: "AVAILABLE",
        serviceId: service._id,
      },
      { status: "LOCKED" },
      { session }
    );

    if (lockResult.modifiedCount !== slotIds.length) {
      throw new Error("Failed to lock slots");
    }

    const totalPrice = slots.reduce((sum, slot) => sum + slot.price, 0);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const booking = await Booking.create(
      [
        {
          slotIds,
          userId: user.id,
          creatorId,
          serviceId: service._id,
          serviceTitle: service.title,
          durationMinutes: totalMinutes,
          price: totalPrice,
          currency: creatorProfile.currency,
          status: "REQUESTED",
          paymentStatus: "PAID",
          expiresAt,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(201).json({
      message: "Booking request sent",
      booking: booking[0],
    });

  } catch (err: any) {
    await session.abortTransaction();

    return res.status(400).json({
      message: err.message || "Failed to request booking",
    });
  } finally {
    session.endSession();
  }
};

/* =========================================================
   REFUND (DISPUTE SAFE)
========================================================= */

const REFUND_ALLOWED_STATUSES = [
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
] as const;

export const refundBooking = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { bookingId } = req.params;

  if (!user)
    return res.status(401).json({ message: "Unauthorized" });

  const booking = await Booking.findById(bookingId);

  if (!booking)
    return res.status(404).json({ message: "Booking not found" });

  const openDispute = await Dispute.findOne({
    bookingId,
    status: "OPEN",
  });

  if (openDispute) {
    return res.status(400).json({
      message: "Cannot refund while dispute is open",
    });
  }

  if (
    booking.isFinancialLocked ||
    booking.isPayoutEligible ||
    booking.paymentStatus !== "PAID" ||
    !booking.isPayable ||
    !REFUND_ALLOWED_STATUSES.includes(booking.status as any)
  ) {
    return res.status(400).json({
      message: "Refund not allowed",
    });
  }

  booking.paymentStatus = "REFUNDED";
  booking.isFinancialLocked = true;

  await booking.save();

  return res.status(200).json({
    message: "Booking marked as refunded",
    booking,
  });
};