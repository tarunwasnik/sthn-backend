// backend/src/controllers/creatorBookingDecision.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { UserProfile } from "../models/userProfile.model";
import { CREATOR_STATUS } from "../constants/creatorStatus";

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
      (b) => b.slotIds || []
    );

    const slots = await Slot.find({
      _id: { $in: allSlotIds },
    }).lean();

    const slotMap = new Map(
      slots.map((s) => [String(s._id), s])
    );

    /* ================= FINAL MERGE ================= */

    const enrichedBookings = bookings.map((b) => {
      const profile = userMap.get(String(b.userId));

      return {
        ...b,

        user: {
          displayName: profile?.username || "Unknown",
          avatarUrl: profile?.profilePhotos?.[0] || null,
        },

        slots: (b.slotIds || [])
          .map((id: any) => slotMap.get(String(id)))
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

/* =========================================================
   DECIDE BOOKING (UNCHANGED)
========================================================= */

export const decideBooking = async (req: Request, res: Response) => {
  const user = req.user;
  let { bookingId, decision } = req.body;

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

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await Booking.findOne({
      _id: bookingId,
      creatorId: user.id,
      status: "REQUESTED",
    }).session(session);

    if (!booking) {
      throw new Error("Booking not found or already processed");
    }

    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
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
    } else {
      const slotUpdate = await Slot.updateMany(
        {
          _id: { $in: booking.slotIds },
          status: "LOCKED",
        },
        { status: "AVAILABLE" },
        { session }
      );

      if (slotUpdate.modifiedCount !== booking.slotIds.length) {
        throw new Error("Failed to release all slots");
      }

      booking.status = "REJECTED";

      if (booking.paymentStatus === "PAID") {
        booking.paymentStatus = "REFUNDED";
      }
    }

    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

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