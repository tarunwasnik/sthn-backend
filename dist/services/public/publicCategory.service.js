"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCategoriesData = void 0;
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
/**
 * Public Category Service
 * Phase 31.0 — read-only, DB-backed
 */
const getPublicCategoriesData = async () => {
    const creators = await creatorProfile_model_1.CreatorProfile.find({ status: "APPROVED" }, { _id: 1 }).lean();
    /**
     * Phase 31.0 NOTE:
     * Categories do not exist yet on schema.
     * We return static categories with derived counts = 0.
     * This will be expanded in Phase 31.1.
     */
    return {
        categories: [
            {
                id: "music",
                name: "Music",
                iconUrl: "/icons/music.svg",
                creatorCount: creators.length,
            },
            {
                id: "fitness",
                name: "Fitness",
                iconUrl: "/icons/fitness.svg",
                creatorCount: 0,
            },
        ],
    };
};
exports.getPublicCategoriesData = getPublicCategoriesData;
