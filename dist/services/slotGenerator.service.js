"use strict";
// backend/src/services/slotGenerator.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSlotsForAvailability = void 0;
const slot_model_1 = require("../models/slot.model");
const luxon_1 = require("luxon");
const MIN_SLOT_DURATION = 30;
const MAX_SLOT_DURATION = 480;
const generateSlotsForAvailability = async ({ availabilityId, creatorId, serviceId, date, startTime, endTime, timezone, slotDurationMinutes, price, session, }) => {
    /* =========================================================
       SLOT DURATION VALIDATION
    ========================================================= */
    if (slotDurationMinutes < MIN_SLOT_DURATION ||
        slotDurationMinutes > MAX_SLOT_DURATION) {
        throw new Error(`Slot duration must be between ${MIN_SLOT_DURATION} and ${MAX_SLOT_DURATION} minutes`);
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
    const availabilityDate = luxon_1.DateTime.fromJSDate(date);
    const [startHour, startMinute] = startTime
        .split(":")
        .map(Number);
    const [endHour, endMinute] = endTime
        .split(":")
        .map(Number);
    console.log("timezone:", timezone);
    console.log("date:", date);
    console.log("fromJSDate:", luxon_1.DateTime.fromJSDate(date).toISO());
    console.log("setZone:", luxon_1.DateTime.fromJSDate(date)
        .setZone(timezone)
        .toISO());
    let currentSlotStart = luxon_1.DateTime.fromObject({
        year: availabilityDate.year,
        month: availabilityDate.month,
        day: availabilityDate.day,
        hour: startHour,
        minute: startMinute,
    }, { zone: timezone });
    const availabilityEnd = luxon_1.DateTime.fromObject({
        year: availabilityDate.year,
        month: availabilityDate.month,
        day: availabilityDate.day,
        hour: endHour,
        minute: endMinute,
    }, { zone: timezone });
    while (currentSlotStart.plus({
        minutes: slotDurationMinutes,
    }) <= availabilityEnd) {
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
        await slot_model_1.Slot.insertMany(slots, {
            session,
        });
    }
    return slots;
};
exports.generateSlotsForAvailability = generateSlotsForAvailability;
