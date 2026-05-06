// backend/src/controllers/creatorAvailability.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Availability } from "../models/availability.model";
import { CreatorService } from "../models/creatorService.model";
import { generateSlotsForAvailability } from "../services/slotGenerator.service";
import { Slot } from "../models/slot.model";

/* =========================================================
   CREATE AVAILABILITY
========================================================= */

export const createAvailability = async (
  req: Request,
  res: Response
) => {

  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const {
    serviceId,
    date,
    startTime,
    endTime,
    slotDurationMinutes
  } = req.body;

  if (!serviceId || !date || !startTime || !endTime) {
    return res.status(400).json({
      message:
        "serviceId, date, startTime and endTime are required",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return res.status(400).json({
      message: "Invalid serviceId",
    });
  }

  const service = await CreatorService.findOne({
    _id: serviceId,
    creatorId: new mongoose.Types.ObjectId(user.id),
    isActive: true,
  });

  if (!service) {
    return res.status(404).json({
      message: "Service not found or inactive",
    });
  }

  if (startTime >= endTime) {
    return res.status(400).json({
      message: "startTime must be before endTime",
    });
  }

  const [year, month, day] = date.split("-").map(Number);

const availabilityDate = new Date(
  Date.UTC(year, month - 1, day)
);

  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);

  const existingAvailabilities = await Availability.find({
    creatorId: user.id,
    date: availabilityDate,
    status: "ACTIVE",
  });

  for (const existing of existingAvailabilities) {

    const existingStart = toMinutes(existing.startTime);
    const existingEnd = toMinutes(existing.endTime);

    const overlaps =
      newStart < existingEnd && newEnd > existingStart;

    if (overlaps) {
      return res.status(400).json({
        message:
          "Availability overlaps with an existing active window",
      });
    }
  }

  const availability = await Availability.create({
    creatorId: user.id,
    serviceId,
    date: availabilityDate,
    startTime,
    endTime,
    slotDurationMinutes:
      slotDurationMinutes || service.durationMinutes,
    status: "ACTIVE",
  });

  await generateSlotsForAvailability({
    availabilityId: availability._id as mongoose.Types.ObjectId,
    creatorId: new mongoose.Types.ObjectId(user.id),
    serviceId: service._id,
    date: availabilityDate,
    startTime,
    endTime,
    slotDurationMinutes: availability.slotDurationMinutes,
    price: service.price,
  });

  return res.status(201).json({
    message: "Availability created successfully",
    availability,
  });

};

/* =========================================================
   CANCEL AVAILABILITY
========================================================= */

export const cancelAvailability = async (
  req: Request,
  res: Response
) => {

  const user = req.user;
  const { availabilityId } = req.params;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
    return res.status(400).json({
      message: "Invalid availabilityId",
    });
  }

  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const availability = await Availability.findOne({
      _id: availabilityId,
      creatorId: user.id,
      status: "ACTIVE",
    }).session(session);

    if (!availability) {
      throw new Error(
        "Availability not found or already cancelled"
      );
    }

    await Slot.updateMany(
      {
        availabilityId: availability._id,
        status: "AVAILABLE",
      },
      { status: "CANCELLED" },
      { session }
    );

    availability.status = "CANCELLED";
    await availability.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Availability cancelled successfully",
      availability,
    });

  } catch (err: any) {

    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: err.message || "Failed to cancel availability",
    });

  }
};

/* =========================================================
   GET CREATOR AVAILABILITIES (DASHBOARD)
========================================================= */

export const getCreatorAvailabilities = async (
  req: Request,
  res: Response
) => {

  const user = req.user;
  const { includeCancelled } = req.query;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

 const matchFilter: any = {
  creatorId: new mongoose.Types.ObjectId(user.id),
};

if (includeCancelled !== "true") {
  matchFilter.status = "ACTIVE";
  matchFilter.date = {
    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
  };
}

  const availabilities = await Availability.aggregate([

    { $match: matchFilter },

    {
      $lookup: {
        from: "slots",
        localField: "_id",
        foreignField: "availabilityId",
        as: "slots",
      },
    },

    {
      $addFields: {

        totalSlots: { $size: "$slots" },

        availableSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: { $eq: ["$$slot.status", "AVAILABLE"] },
            },
          },
        },

        lockedSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: { $eq: ["$$slot.status", "LOCKED"] },
            },
          },
        },

        bookedSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: { $eq: ["$$slot.status", "BOOKED"] },
            },
          },
        },

        cancelledSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: { $eq: ["$$slot.status", "CANCELLED"] },
            },
          },
        },

      },
    },

    { $project: { slots: 0 } },

    { $sort: { date: -1 } },

  ]);

  return res.status(200).json({
    count: availabilities.length,
    availabilities,
  });
};

/* =========================================================
   GET SLOTS FOR AN AVAILABILITY (CREATOR PANEL)
========================================================= */

export const getAvailabilitySlots = async (
  req: Request,
  res: Response
) => {

  const { availabilityId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(availabilityId)) {
    return res.status(400).json({
      message: "Invalid availabilityId",
    });
  }

  const slots = await Slot.find({
    availabilityId,
  }).sort({ startTime: 1 });

  return res.status(200).json({
    count: slots.length,
    slots,
  });

};

/* =========================================================
   DISABLE SLOT
========================================================= */

export const disableSlot = async (
  req: Request,
  res: Response
) => {

  const { slotId } = req.params;

  const slot = await Slot.findByIdAndUpdate(
    slotId,
    { status: "CANCELLED" },
    { new: true }
  );

  if (!slot) {
    return res.status(404).json({
      message: "Slot not found",
    });
  }

  return res.json({
    message: "Slot disabled",
    slot,
  });
};

/* =========================================================
   ENABLE SLOT
========================================================= */

export const enableSlot = async (
  req: Request,
  res: Response
) => {

  const { slotId } = req.params;

  const slot = await Slot.findByIdAndUpdate(
    slotId,
    { status: "AVAILABLE" },
    { new: true }
  );

  if (!slot) {
    return res.status(404).json({
      message: "Slot not found",
    });
  }

  return res.json({
    message: "Slot enabled",
    slot,
  });
};

/* =========================================================
   DELETE SLOT
========================================================= */

export const deleteSlot = async (
  req: Request,
  res: Response
) => {

  const { slotId } = req.params;

  const slot = await Slot.findByIdAndDelete(slotId);

  if (!slot) {
    return res.status(404).json({
      message: "Slot not found",
    });
  }

  return res.json({
    message: "Slot deleted",
  });

};

/* =========================================================
   GET AVAILABLE SLOTS FOR CREATOR (PUBLIC SAFE)
   ✅ FIXED HERE ONLY
========================================================= */

export const getAvailableSlotsForCreator = async (
  req: any,
  res: Response
) => {

  const { creatorId } = req.params;
  const { date } = req.query;

  if (!creatorId || !date) {
    return res.status(400).json({
      message: "creatorId and date are required",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(creatorId)) {
    return res.status(400).json({
      message: "Invalid creatorId",
    });
  }

  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  const nextDate = new Date(selectedDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const slots = await Slot.aggregate([
    {
      $match: {
        creatorId: new mongoose.Types.ObjectId(creatorId),
        status: "AVAILABLE",

        // ✅ FIX: use date instead of startTime
        date: {
          $gte: selectedDate,
          $lt: nextDate,
        },
      },
    },
    {
      $lookup: {
        from: "availabilities",
        localField: "availabilityId",
        foreignField: "_id",
        as: "availability",
      },
    },
    { $unwind: "$availability" },
    {
  $match: {
    "availability.status": "ACTIVE",
  },
},
{
  $addFields: {
    slotDateTime: "$startTime",
  },
},
{
  $match: {
    slotDateTime: {
      $gte: new Date(),
    },
  },
},
    {
      $sort: { startTime: 1 },
    },
  ]);

  return res.status(200).json({
    date,
    count: slots.length,
    slots,
  });

};