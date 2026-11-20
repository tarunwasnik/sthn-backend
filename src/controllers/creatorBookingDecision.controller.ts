// backend/src/controllers/creatorBookingDecision.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { UserProfile } from "../models/userProfile.model";
import { CREATOR_STATUS } from "../constants/creatorStatus";
import { CreatorService } from "../models/creatorService.model";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { bookingFinancialTerminationService } from "../services/financial/bookingFinancialTermination.service";
import User from "../models/User";
import { resolveAccountGovernance } from "../services/accountGovernance/accountGovernanceResolver.service";
import { createBookingNotifications, deliverCreatedBookingNotifications } from "../services/notification/bookingNotification.service";
import { emitBookingRequestsChanged } from "../sockets/chat.socket";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../enums/financial/paymentStatus.enum";
import { PaymentOperationStatus } from "../enums/financial/paymentOperationStatus.enum";

/* =========================================================
   GET CREATOR BOOKINGS (EXTENDED WITH USER + SLOTS)
========================================================= */

export const getCreatorBookings = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { status } = req.query;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const creatorProfile = await CreatorProfile.findOne({
      userId: user.id,
    });

    if (!creatorProfile) {
      return res.status(403).json({
        message: "Creator profile not found",
      });
    }

    if (creatorProfile.status !== CREATOR_STATUS.ACTIVE) {
      return res.status(403).json({
        message: "Creator profile is not active",
      });
    }

    /* ================= FILTER ================= */

    const filter: any = {
      creatorId: user.id,
    };

    if (status && status !== "ALL") {
      filter.status = status;
    }

    /* ================= BASE FETCH ================= */

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    /* ================= USER ENRICH ================= */

    const userIds = [
      ...new Set(bookings.map((b) => String(b.userId))),
    ];

    const userProfiles = await UserProfile.find({
      userId: { $in: userIds },
    }).lean();

    const userMap = new Map(
      userProfiles.map((u) => [
        String(u.userId),
        u,
      ])
    );

    /* ================= SLOT ENRICH ================= */

const allSlotIds = bookings.flatMap(
  (b: any) => b.slotIds || []
);

const slots = await Slot.find({
  _id: { $in: allSlotIds },
}).lean();

const slotMap = new Map(
  slots.map((s) => [String(s._id), s])
);

/* ================= SERVICE ENRICH ================= */

const serviceIds = [
  ...new Set(
    bookings
      .map((b: any) => String(b.serviceId))
      .filter(Boolean)
  ),
];

const services = await CreatorService.find({
  _id: { $in: serviceIds },
}).lean();

const serviceMap = new Map(
  services.map((s) => [
    String(s._id),
    s,
  ])
);

/* ================= FINAL MERGE ================= */

const enrichedBookings = bookings.map((b: any) => {
  const profile = userMap.get(String(b.userId));

  const service = serviceMap.get(
    String(b.serviceId)
  );

  return {
    ...b,

    service: {
      _id: service?._id || null,
      title: service?.title || "Untitled",
      media: service?.media || [],
    },

    user: {
      _id: String(b.userId),
      displayName: profile?.username || "Unknown",
      avatarUrl:
        profile?.avatar || null,
    },

    slots: (b.slotIds || [])
      .map((id: any) =>
        slotMap.get(String(id))
      )
      .filter(Boolean),
  };
});

    return res.status(200).json({
      bookings: enrichedBookings,
    });

  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch bookings",
    });
  }
};

export const getCreatorPendingBookingRequestCount = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  try {
    const pendingRequestCount = await Booking.countDocuments({
      creatorId: req.user.id,
      status: "REQUESTED",
      expiresAt: { $gt: new Date() },
    });
    return res.status(200).json({ pendingRequestCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to count booking requests" });
  }
};

/* =========================================================
   DECIDE BOOKING (UNCHANGED)
========================================================= */

export const decideBooking = async (req: Request, res: Response) => {
  const user = req.user;
  const bookingId = req.params.bookingId ?? req.body.bookingId;
  let { decision } = req.body;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!bookingId) {
    return res.status(400).json({
      message: "bookingId is required",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid bookingId" });
  }

  decision = String(decision).toUpperCase();

  if (!["ACCEPT", "REJECT"].includes(decision)) {
    return res.status(400).json({
      message: "decision must be ACCEPT or REJECT",
    });
  }

  const creatorProfile = await CreatorProfile.findOne({
    userId: user.id,
  });

  if (!creatorProfile) {
    return res.status(403).json({
      message: "Creator profile not found",
    });
  }

  if (creatorProfile.status !== CREATOR_STATUS.ACTIVE) {
    return res.status(403).json({
      message: "Creator profile is not active",
    });
  }

  if (decision === "REJECT") {
    try {
      const result = await bookingFinancialTerminationService.terminateBookingFinancially({
        bookingId,
        actorId: user.id,
        actorType: BookingTerminationActorType.CREATOR,
        terminationType: BookingTerminationType.CREATOR_REJECTED,
      });
      if (!result.replay) emitBookingRequestsChanged(user.id);
      return res.status(200).json({ message: "Booking rejected successfully", ...result });
    } catch (error: any) {
      return res.status(error.statusCode ?? 400).json({ code: error.code, message: error.message });
    }
  }

  const creatorUser = await User.findById(user.id);

  if (!creatorUser) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const creatorGovernance = resolveAccountGovernance(creatorUser);

  if (creatorGovernance.blocksAcceptingBookings) {
    return res.status(403).json({
      message:
        "Your account is currently restricted from accepting booking requests.",
      ...(creatorGovernance.isCreatorCooldownActive &&
      creatorGovernance.cooldownUntil
        ? {
            cooldownUntil: creatorGovernance.cooldownUntil,
          }
        : {}),
    });
  }

  const session = await mongoose.startSession();
  let notificationResults: Awaited<ReturnType<typeof createBookingNotifications>> = [];

  try {
    session.startTransaction();

    const booking = await Booking.findOne({
      _id: bookingId,
      creatorId: user.id,
      status: "REQUESTED",
      "terminationClaim.status": { $ne: "ACTIVE" },
    }).session(session);

    if (!booking) {
      throw new Error("Booking not found or already processed");
    }

    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
      throw new Error("Booking request has expired");
    }

    const slots = await Slot.find(
      { _id: { $in: booking.slotIds } },
      null,
      { session }
    );

    if (slots.length !== booking.slotIds.length) {
      throw new Error("One or more slots no longer exist");
    }

    const invalidOwner = slots.some(
      (slot) => String(slot.creatorId) !== String(booking.creatorId)
    );

    if (invalidOwner) {
      throw new Error("Slot ownership mismatch");
    }

    if (decision === "ACCEPT") {
      if (booking.paymentMethod && booking.paymentMethod !== PaymentMethod.WALLET) {
        const payment = booking.paymentId ? await Payment.findById(booking.paymentId).session(session) : null;
        const operation = payment ? await PaymentOperation.findOne({ paymentId: payment._id }).select("+userId +idempotencyKey").session(session) : null;
        if (!payment || payment.status !== PaymentStatus.CAPTURED ||
            booking.paymentStatus !== "PAID" || !booking.isPayable ||
            !payment.bookingId.equals(booking._id) || !payment.userId.equals(booking.userId) ||
            !payment.creatorId.equals(booking.creatorId) || payment.amount !== booking.totalAmount ||
            payment.currency !== booking.currency || payment.method !== booking.paymentMethod ||
            !operation || operation.status !== PaymentOperationStatus.CONFIRMED || !payment.providerPaymentId ||
            !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) ||
            !operation.userId.equals(booking.userId) || operation.idempotencyKey !== payment.idempotencyKey ||
            operation.provider !== payment.provider || operation.providerPaymentId !== payment.providerPaymentId ||
            operation.requestedAmount !== payment.amount || operation.requestedCurrency !== payment.currency ||
            operation.verifiedAmount !== payment.amount || operation.verifiedCurrency !== payment.currency) {
          throw new Error("Provider payment is not verified for this booking.");
        }
      }
      const hasNonLocked = slots.some(
        (slot) => slot.status !== "LOCKED"
      );

      if (hasNonLocked) {
        throw new Error("One or more slots are no longer locked");
      }

      const slotUpdate = await Slot.updateMany(
        {
          _id: { $in: booking.slotIds },
          status: "LOCKED",
        },
        { status: "BOOKED" },
        { session }
      );

      if (slotUpdate.modifiedCount !== booking.slotIds.length) {
        throw new Error("Failed to book all slots");
      }

      booking.status = "CONFIRMED";
      booking.creatorAcceptedAt = new Date();
    } else {
      throw new Error("Creator rejection must be processed by the Financial termination service.");
    }

    await booking.save({ session });
    notificationResults = await createBookingNotifications(booking, "CONFIRMED", [{ id: String(booking.userId), actor: "user" }], session);

    await session.commitTransaction();
    session.endSession();
    deliverCreatedBookingNotifications(notificationResults);
    emitBookingRequestsChanged(String(booking.creatorId));

    return res.status(200).json({
      message: `Booking ${decision.toLowerCase()} successfully`,
      booking,
    });

  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: err.message || "Failed to process booking decision",
    });
  }
};
