// backend/src/controllers/creatorAvailability.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Availability } from "../models/availability.model";
import { CreatorService } from "../models/creatorService.model";
import { generateSlotsForAvailability } from "../services/slotGenerator.service";
import { Slot } from "../models/slot.model";
import { DateTime } from "luxon";

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
  timezone,
} = req.body;

  if (
  !serviceId ||
  !date ||
  !startTime ||
  !endTime ||
  !timezone
) {
    return res.status(400).json({
  message:
    "serviceId, date, startTime, endTime and timezone are required",
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
const creatorNow = DateTime.now().setZone(
  timezone
);

const availabilityStartDateTime =
  DateTime.fromObject(
    {
      year,
      month,
      day,
      hour: Number(startTime.split(":")[0]),
      minute: Number(startTime.split(":")[1]),
    },
    {
      zone: timezone,
    }
  );

console.log(
  "CREATOR NOW:",
  creatorNow.toISO()
);

console.log(
  "AVAILABILITY START:",
  availabilityStartDateTime.toISO()
);

if (
  availabilityStartDateTime <= creatorNow
) {
  return res.status(400).json({
    message:
      "Availability must start in the future",
  });
}

  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

const newStart = toMinutes(startTime);
const newEnd = toMinutes(endTime);

console.log("NEW AVAILABILITY REQUEST");
console.log({
  creatorId: user.id,
  date: availabilityDate,
  startTime,
  endTime,
  serviceId,
  timezone,
});

const existingAvailabilities = await Availability.find({
  creatorId: user.id,
  serviceId,
  date: availabilityDate,
  status: "ACTIVE",
});

console.log(
  "MATCHING ACTIVE AVAILABILITIES:",
  existingAvailabilities.map(a => ({
    id: a._id,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
  }))
);

for (const existing of existingAvailabilities) {
  const existingStart = toMinutes(existing.startTime);
  const existingEnd = toMinutes(existing.endTime);

  const overlaps =
    newStart < existingEnd &&
    newEnd > existingStart;

  if (overlaps) {
    return res.status(400).json({
      message:
        "Availability overlaps with an existing active window",
    });
  }
}

  const session = await mongoose.startSession();

try {

  session.startTransaction();

  const availability = await Availability.create(
    [
      {
        creatorId: user.id,
        serviceId,
        date: availabilityDate,
        startTime,
        endTime,
        timezone,
        slotDurationMinutes:
          service.durationMinutes,
        status: "ACTIVE",
      },
    ],
    { session }
  );

  await generateSlotsForAvailability({
    availabilityId:
      availability[0]._id as mongoose.Types.ObjectId,

    creatorId:
      new mongoose.Types.ObjectId(user.id),

    serviceId:
      service._id as mongoose.Types.ObjectId,

    date: availabilityDate,
    startTime,
    endTime,
    timezone,

    slotDurationMinutes:
      availability[0].slotDurationMinutes,

    price: service.price,

    session,
  });

  await session.commitTransaction();

  return res.status(201).json({
    message: "Availability created successfully",
    availability: availability[0],
  });

} catch (err: any) {

  await session.abortTransaction();

  return res.status(400).json({
    message:
      err.message ||
      "Failed to create availability",
  });

} finally {

  session.endSession();

}

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

    const slots = await Slot.find({
  availabilityId: availability._id,
}).session(session);

const hasLockedSlots = slots.some(
  (slot) => slot.status === "LOCKED"
);

const hasBookedSlots = slots.some(
  (slot) => slot.status === "BOOKED"
);

if (hasLockedSlots || hasBookedSlots) {
  throw new Error(
    "Availability can only be cancelled when all slots are free"
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

export const deleteAvailability = async (
  req: Request,
  res: Response
) => {

  const user = req.user;
  const { availabilityId } = req.params;

  if (!user) {
    return res.status(401).json({
      message: "Unauthorized",
    });
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
    }).session(session);

    if (!availability) {
      throw new Error("Availability not found");
    }

    console.log(
      "DELETE AVAILABILITY STATUS:",
      availability.status
    );

    const availabilityDate = new Date(
      availability.date
    );

    const [endHour, endMinute] =
      availability.endTime
        .split(":")
        .map(Number);

    availabilityDate.setUTCHours(
      endHour,
      endMinute + 30,
      0,
      0
    );

    const isHistoryAvailability =
      availability.status === "CANCELLED" ||
      availabilityDate <= new Date();

    if (!isHistoryAvailability) {
      throw new Error(
        "Only history availabilities can be deleted"
      );
    }

    await Slot.deleteMany(
      {
        availabilityId: availability._id,
      },
      { session }
    );

    await Availability.deleteOne(
      {
        _id: availability._id,
      },
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      message:
        "Availability deleted successfully",
    });

  } catch (err: any) {

    await session.abortTransaction();

    return res.status(400).json({
      message:
        err.message ||
        "Failed to delete availability",
    });

  } finally {

    session.endSession();

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
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const availabilities = await Availability.aggregate([

    {
      $match: {
        creatorId: new mongoose.Types.ObjectId(user.id),
      },
    },

    {
      $lookup: {
        from: "creatorservices",
        localField: "serviceId",
        foreignField: "_id",
        as: "service",
      },
    },

    {
      $unwind: {
        path: "$service",
        preserveNullAndEmptyArrays: true,
      },
    },

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

        serviceTitle: "$service.title",

        totalSlots: {
          $size: "$slots",
        },

        availableSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: {
                $eq: ["$$slot.status", "AVAILABLE"],
              },
            },
          },
        },

        lockedSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: {
                $eq: ["$$slot.status", "LOCKED"],
              },
            },
          },
        },

        bookedSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: {
                $eq: ["$$slot.status", "BOOKED"],
              },
            },
          },
        },

        cancelledSlots: {
          $size: {
            $filter: {
              input: "$slots",
              as: "slot",
              cond: {
                $eq: ["$$slot.status", "CANCELLED"],
              },
            },
          },
        },

      },
    },

    /* ============================================
       AVAILABILITY END DATETIME
    ============================================ */

    {
      $addFields: {

        availabilityEndDateTime: {
          $dateFromString: {
            dateString: {
              $concat: [
                {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$date",
                  },
                },
                "T",
                "$endTime",
                ":00",
              ],
            },
          },
        },

      },
    },

    /* ============================================
       30 MIN BUFFER
    ============================================ */

    {
      $addFields: {

        availabilityEndWithBuffer: {
          $dateAdd: {
            startDate: "$availabilityEndDateTime",
            unit: "minute",
            amount: 30,
          },
        },

      },
    },

    /* ============================================
       ACTIVE TAB / HISTORY TAB
    ============================================ */

    {
      $match:
        includeCancelled === "true"
          ? {
              $or: [
                {
                  status: "CANCELLED",
                },
                {
                  availabilityEndWithBuffer: {
                    $lte: new Date(),
                  },
                },
              ],
            }
          : {
              status: "ACTIVE",
              availabilityEndWithBuffer: {
                $gt: new Date(),
              },
            },
    },

    {
      $project: {
        slots: 0,
        service: 0,
        availabilityEndDateTime: 0,
        availabilityEndWithBuffer: 0,
      },
    },

    {
      $sort: {
        date: -1,
      },
    },

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