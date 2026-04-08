// backend/src/controllers/public/publicSlot.controller.ts

import { Request, Response } from "express";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { Availability } from "../../models/availability.model";
import { Slot } from "../../models/slot.model";
import { CreatorService } from "../../models/creatorService.model";

export const getPublicCreatorSlots = async (
  req: Request,
  res: Response
) => {
  try {
    const { slug } = req.params;
    const { date } = req.query;

    if (!slug) {
      return res.status(400).json({
        message: "Creator slug is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        message: "Date query parameter is required",
      });
    }

    const creator = await CreatorProfile.findOne({
      slug,
      status: "active",
    });

    if (!creator) {
      return res.status(404).json({
        message: "Creator not found",
      });
    }

    const [year, month, day] = (date as string)
      .split("-")
      .map(Number);

    const startOfDay = new Date(
      Date.UTC(year, month - 1, day, 0, 0, 0, 0)
    );

    const endOfDay = new Date(
      Date.UTC(year, month - 1, day, 23, 59, 59, 999)
    );

    const availability = await Availability.find({
      creatorId: creator.userId,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: "ACTIVE",
    });

    if (availability.length === 0) {
      return res.json({ slots: [] });
    }

    const availabilityIds = availability.map((a) => a._id);

    const slots = await Slot.find({
      availabilityId: { $in: availabilityIds },
      status: "AVAILABLE",
    }).sort({ startTime: 1 });

    if (slots.length === 0) {
      return res.json({ slots: [] });
    }

    const serviceIds = [...new Set(slots.map((s) => s.serviceId.toString()))];

    const services = await CreatorService.find({
      _id: { $in: serviceIds },
      isActive: true,
    }).lean();

    const serviceMap = new Map(
      services.map((s: any) => [s._id.toString(), s])
    );

    const formattedSlots = slots.map((slot: any) => {
      const service = serviceMap.get(slot.serviceId.toString());

      return {
        id: slot._id.toString(),
        serviceId: slot.serviceId,
        serviceTitle: service?.title || "",
        price: service?.price || slot.price,
        durationMinutes: service?.durationMinutes || null,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
    });

    return res.json({
      slots: formattedSlots,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "Failed to fetch slots",
    });
  }
};