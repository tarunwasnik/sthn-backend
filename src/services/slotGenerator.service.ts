// backend/src/services/slotGenerator.service.ts

import { Slot } from "../models/slot.model";
import mongoose from "mongoose";
import { DateTime } from "luxon";

interface GenerateSlotsInput {
  availabilityId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;

  date: Date;
  startTime: string; // "18:00"
  endTime: string;   // "22:00"

  timezone: string;

  slotDurationMinutes: number;

  // 💰 Pricing (comes from service)
  price: number;
  session?: mongoose.ClientSession;
}

const MIN_SLOT_DURATION = 30;
const MAX_SLOT_DURATION = 480;

export const generateSlotsForAvailability = async ({
  availabilityId,
  creatorId,
  serviceId,
  date,
  startTime,
  endTime,
  timezone,
  slotDurationMinutes,
  price,
  session,
}: GenerateSlotsInput) => {

  /* =========================================================
     SLOT DURATION VALIDATION
  ========================================================= */

  if (
    slotDurationMinutes < MIN_SLOT_DURATION ||
    slotDurationMinutes > MAX_SLOT_DURATION
  ) {
    throw new Error(
      `Slot duration must be between ${MIN_SLOT_DURATION} and ${MAX_SLOT_DURATION} minutes`
    );
  }

  if (slotDurationMinutes % 5 !== 0) {
    throw new Error("Slot duration must be divisible by 5 minutes");
  }

  /* =========================================================
     PRICE VALIDATION
  ========================================================= */

  if (price < 0) {
    throw new Error("Price must be greater than or equal to 0");
  }

  /* ========================================================= */

  const slots = [];

 const availabilityDate = DateTime.fromJSDate(date);

const [startHour, startMinute] = startTime
  .split(":")
  .map(Number);

const [endHour, endMinute] = endTime
  .split(":")
  .map(Number);

console.log("timezone:", timezone);
console.log("date:", date);

console.log(
  "fromJSDate:",
  DateTime.fromJSDate(date).toISO()
);

console.log(
  "setZone:",
  DateTime.fromJSDate(date)
    .setZone(timezone)
    .toISO()
);

let currentSlotStart = DateTime.fromObject(
  {
    year: availabilityDate.year,
    month: availabilityDate.month,
    day: availabilityDate.day,
    hour: startHour,
    minute: startMinute,
  },
  { zone: timezone }
);

const availabilityEnd = DateTime.fromObject(
  {
    year: availabilityDate.year,
    month: availabilityDate.month,
    day: availabilityDate.day,
    hour: endHour,
    minute: endMinute,
  },
  { zone: timezone }
);

while (
  currentSlotStart.plus({
    minutes: slotDurationMinutes,
  }) <= availabilityEnd
) {

  const currentSlotEnd = currentSlotStart.plus({
    minutes: slotDurationMinutes,
  });

  slots.push({
    availabilityId,
    creatorId,
    serviceId,

    startTime: currentSlotStart.toUTC().toJSDate(),
    endTime: currentSlotEnd.toUTC().toJSDate(),

    timezone,

    status: "AVAILABLE",
    price,
  });

  currentSlotStart = currentSlotEnd;
}

  if (slots.length > 0) {
  await Slot.insertMany(slots, {
  session,
});
}

  return slots;
};