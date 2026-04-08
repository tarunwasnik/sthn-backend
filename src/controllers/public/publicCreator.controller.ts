// backend/src/controllers/public/publicCreator.controller.ts

import { Request, Response } from "express";
import {
  getPublicCreatorsData,
  getPublicCreatorBySlugData,
  getPublicCreatorSlotsData,
} from "../../services/public/publicCreator.service";

/* =========================================================
   GET PUBLIC CREATORS
   ========================================================= */

export const getPublicCreators = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getPublicCreatorsData(req.query);

    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(data);
  } catch (err) {
    console.error("Public creators error:", err);
    res.status(500).json({
      message: "Failed to load public creators",
    });
  }
};

/* =========================================================
   GET PUBLIC CREATOR PROFILE
   ========================================================= */

export const getPublicCreatorBySlug = async (
  req: Request,
  res: Response
) => {
  try {
    const data = await getPublicCreatorBySlugData(
      req.params.slug
    );

    if (!data) {
      return res
        .status(404)
        .json({ message: "Creator not found" });
    }

    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(data);
  } catch (err) {
    console.error("Public creator profile error:", err);
    res.status(500).json({
      message: "Failed to load creator profile",
    });
  }
};

/* =========================================================
   GET CREATOR SLOTS (PUBLIC BOOKING)
   ========================================================= */

export const getPublicCreatorSlots = async (
  req: Request,
  res: Response
) => {
  try {
    const { slug } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        message: "date query parameter required",
      });
    }

    const slots = await getPublicCreatorSlotsData(
      slug,
      date as string
    );

    res.status(200).json({ slots });
  } catch (err) {
    console.error("Public slots error:", err);
    res.status(500).json({
      message: "Failed to load slots",
    });
  }
};