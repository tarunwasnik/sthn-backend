// backend/src/services/slotGenerator.service.ts

import { Slot } from "../models/slot.model";
import mongoose from "mongoose";

interface GenerateSlotsInput {
  availabilityId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;

  date: Date;
  startTime: string; // "18:00"
  endTime: string;   // "22:00"

  slotDurationMinutes: number;

  // 💰 Pricing (comes from service)
  price: number;
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
  slotDurationMinutes,
  price,
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

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;

  let currentMinutes = startTotalMinutes;

  while (currentMinutes + slotDurationMinutes <= endTotalMinutes) {
    const slotStart = new Date(date);
    slotStart.setHours(
      Math.floor(currentMinutes / 60),
      currentMinutes % 60,
      0,
      0
    );

    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);

    slots.push({
      availabilityId,
      creatorId,
      serviceId,
      startTime: slotStart,
      endTime: slotEnd,
      status: "AVAILABLE",
      price,
    });

    currentMinutes += slotDurationMinutes;
  }

  if (slots.length > 0) {
    await Slot.insertMany(slots, { ordered: false });
  }

  return slots;
};