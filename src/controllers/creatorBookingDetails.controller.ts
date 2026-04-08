// backend/src/controllers/creatorBookingDetails.controller.ts

import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { Slot } from "../models/slot.model";
import { CreatorService } from "../models/creatorService.model";
import { UserProfile } from "../models/userProfile.model";

export const getCreatorBookingDetails = async (
  req: Request,
  res: Response
) => {
  const user = req.user;
  const { id } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const booking = await Booking.findOne({
      _id: id,
      creatorId: user.id,
    }).lean();

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const slots = await Slot.find({
      _id: { $in: booking.slotIds },
    })
      .sort({ startTime: 1 })
      .lean();

    const userProfile = await UserProfile.findOne({
      userId: booking.userId,
    }).lean();

    const service = await CreatorService.findById(
      booking.serviceId
    ).lean();

    return res.status(200).json({
      booking: {
        ...booking,
        slots,

        /* ✅ FIXED USER */
        user: {
          _id: booking.userId,
          displayName:
            userProfile?.username || "User",
          avatarUrl:
            userProfile?.profilePhotos?.[0] || null,
        },

        service: {
          _id: booking.serviceId,
          title: booking.serviceTitle,
          data: service || null,
        },
      },
    });

  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch booking",
    });
  }
};