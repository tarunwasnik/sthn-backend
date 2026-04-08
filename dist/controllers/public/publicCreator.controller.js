"use strict";
// backend/src/controllers/public/publicCreator.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCreatorSlots = exports.getPublicCreatorBySlug = exports.getPublicCreators = void 0;
const publicCreator_service_1 = require("../../services/public/publicCreator.service");
/* =========================================================
   GET PUBLIC CREATORS
   ========================================================= */
const getPublicCreators = async (req, res) => {
    try {
        const data = await (0, publicCreator_service_1.getPublicCreatorsData)(req.query);
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).json(data);
    }
    catch (err) {
        console.error("Public creators error:", err);
        res.status(500).json({
            message: "Failed to load public creators",
        });
    }
};
exports.getPublicCreators = getPublicCreators;
/* =========================================================
   GET PUBLIC CREATOR PROFILE
   ========================================================= */
const getPublicCreatorBySlug = async (req, res) => {
    try {
        const data = await (0, publicCreator_service_1.getPublicCreatorBySlugData)(req.params.slug);
        if (!data) {
            return res
                .status(404)
                .json({ message: "Creator not found" });
        }
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).json(data);
    }
    catch (err) {
        console.error("Public creator profile error:", err);
        res.status(500).json({
            message: "Failed to load creator profile",
        });
    }
};
exports.getPublicCreatorBySlug = getPublicCreatorBySlug;
/* =========================================================
   GET CREATOR SLOTS (PUBLIC BOOKING)
   ========================================================= */
const getPublicCreatorSlots = async (req, res) => {
    try {
        const { slug } = req.params;
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({
                message: "date query parameter required",
            });
        }
        const slots = await (0, publicCreator_service_1.getPublicCreatorSlotsData)(slug, date);
        res.status(200).json({ slots });
    }
    catch (err) {
        console.error("Public slots error:", err);
        res.status(500).json({
            message: "Failed to load slots",
        });
    }
};
exports.getPublicCreatorSlots = getPublicCreatorSlots;
