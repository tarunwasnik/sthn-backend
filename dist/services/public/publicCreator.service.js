"use strict";
// backend/src/services/public/publicCreator.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCreatorSlotsData = exports.getPublicCreatorBySlugData = exports.getPublicCreatorsData = void 0;
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const creatorService_model_1 = require("../../models/creatorService.model");
const slot_model_1 = require("../../models/slot.model");
const userProfile_model_1 = require("../../models/userProfile.model");
/**
 * GET /api/public/creators
 * Marketplace Listing Engine (Public)
 */
const getPublicCreatorsData = async (query = {}) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 12;
    const skip = (page - 1) * limit;
    const now = new Date();
    const matchStage = {
        status: "active",
    };
    if (query.category) {
        matchStage.primaryCategory = query.category;
    }
    /* ================= LOCATION FILTER ================= */
    if (query.country) {
        matchStage.country = query.country;
    }
    if (query.city) {
        matchStage.city = query.city;
    }
    if (query.language) {
        matchStage.languages = query.language;
    }
    const basePipeline = [
        { $match: matchStage },
        /* ================= REQUIRE ACTIVE SERVICES ================= */
        {
            $lookup: {
                from: creatorService_model_1.CreatorService.collection.name,
                let: { creatorUserId: "$userId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$creatorId", "$$creatorUserId"] },
                                    { $eq: ["$isActive", true] },
                                ],
                            },
                        },
                    },
                ],
                as: "activeServices",
            },
        },
        { $match: { activeServices: { $ne: [] } } },
        /* ================= SLOT LOOKUP ================= */
        {
            $lookup: {
                from: slot_model_1.Slot.collection.name,
                let: { creatorUserId: "$userId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$creatorId", "$$creatorUserId"] },
                                    { $eq: ["$status", "AVAILABLE"] },
                                    { $gt: ["$startTime", now] },
                                ],
                            },
                        },
                    },
                    { $sort: { startTime: 1 } },
                    { $limit: 1 },
                ],
                as: "availableSlots",
            },
        },
        { $match: { availableSlots: { $ne: [] } } },
        /* ================= PRICE + SLOT INFO ================= */
        {
            $addFields: {
                startingPrice: { $min: "$activeServices.price" },
                nextAvailableSlot: {
                    $arrayElemAt: ["$availableSlots.startTime", 0],
                },
                isAvailable: {
                    $gt: [{ $size: "$availableSlots" }, 0],
                },
            },
        },
        /* ================= JOIN USER PROFILE FOR AGE ================= */
        {
            $lookup: {
                from: userProfile_model_1.UserProfile.collection.name,
                localField: "userId",
                foreignField: "userId",
                as: "profile",
            },
        },
        { $unwind: "$profile" },
        {
            $addFields: {
                age: {
                    $dateDiff: {
                        startDate: "$profile.dateOfBirth",
                        endDate: "$$NOW",
                        unit: "year",
                    },
                },
            },
        },
        /* ================= RESPONSE SHAPE ================= */
        {
            $project: {
                _id: 1,
                slug: 1,
                displayName: 1,
                avatarUrl: 1,
                primaryCategory: 1,
                rating: 1,
                reviewCount: 1,
                country: 1,
                city: 1,
                languages: 1,
                startingPrice: 1,
                currency: 1,
                nextAvailableSlot: 1,
                isAvailable: 1,
                age: 1,
            },
        },
    ];
    /* ================= SORTING ================= */
    const sortOption = query.sort || "recommended";
    if (sortOption === "price_asc") {
        basePipeline.push({ $sort: { startingPrice: 1 } });
    }
    else if (sortOption === "price_desc") {
        basePipeline.push({ $sort: { startingPrice: -1 } });
    }
    else if (sortOption === "rating") {
        basePipeline.push({
            $sort: { rating: -1, reviewCount: -1 },
        });
    }
    else {
        basePipeline.push({
            $sort: { rating: -1, reviewCount: -1 },
        });
    }
    /* ================= COUNT ================= */
    const countPipeline = [...basePipeline, { $count: "total" }];
    const countResult = await creatorProfile_model_1.CreatorProfile.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;
    /* ================= PAGINATION ================= */
    const paginatedPipeline = [
        ...basePipeline,
        { $skip: skip },
        { $limit: limit },
    ];
    const creators = await creatorProfile_model_1.CreatorProfile.aggregate(paginatedPipeline);
    return {
        data: creators.map((c) => ({
            id: c._id.toString(),
            slug: c.slug,
            displayName: c.displayName,
            avatarUrl: c.avatarUrl || "/avatars/default.png",
            primaryCategory: c.primaryCategory,
            rating: c.rating,
            reviewCount: c.reviewCount,
            country: c.country,
            city: c.city,
            languages: c.languages || [],
            age: c.age || null,
            startingPrice: c.startingPrice,
            currency: c.currency,
            isAvailable: c.isAvailable,
            nextAvailableSlot: c.nextAvailableSlot || null,
        })),
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};
exports.getPublicCreatorsData = getPublicCreatorsData;
/**
 * GET /api/public/creators/:slug
 */
const getPublicCreatorBySlugData = async (slug) => {
    const creator = await creatorProfile_model_1.CreatorProfile.findOne({
        slug,
        status: "active",
    }).lean();
    if (!creator)
        return null;
    const profile = await userProfile_model_1.UserProfile.findOne({ userId: creator.userId }, { dateOfBirth: 1 }).lean();
    let age = null;
    if (profile?.dateOfBirth) {
        const today = new Date();
        const birth = new Date(profile.dateOfBirth);
        age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
    }
    const services = await creatorService_model_1.CreatorService.find({
        creatorId: creator.userId,
        isActive: true,
    })
        .sort({ createdAt: -1 })
        .lean();
    return {
        id: creator._id.toString(),
        slug: creator.slug,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl || "/avatars/default.png",
        coverImageUrl: "/covers/default.png",
        bio: creator.bio || "",
        categories: creator.categories || [],
        primaryCategory: creator.primaryCategory,
        rating: creator.rating,
        reviewCount: creator.reviewCount,
        languages: creator.languages || [],
        country: creator.country || "",
        city: creator.city || "",
        currency: creator.currency,
        age,
        services: services.map((s) => ({
            id: s._id.toString(),
            title: s.title,
            description: s.description,
            durationMinutes: s.durationMinutes,
            price: s.price,
        })),
    };
};
exports.getPublicCreatorBySlugData = getPublicCreatorBySlugData;
/**
 * GET /api/public/creators/:slug/slots
 */
const getPublicCreatorSlotsData = async (slug, date) => {
    const creator = await creatorProfile_model_1.CreatorProfile.findOne({
        slug,
        status: "active",
    });
    if (!creator)
        return [];
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const slots = await slot_model_1.Slot.find({
        creatorId: creator.userId,
        status: "AVAILABLE",
        startTime: {
            $gte: startOfDay,
            $lte: endOfDay,
        },
    })
        .populate("serviceId", "title durationMinutes price")
        .sort({ startTime: 1 })
        .lean();
    return slots.map((slot) => ({
        id: slot._id,
        serviceId: slot.serviceId._id,
        serviceTitle: slot.serviceId.title,
        price: slot.serviceId.price,
        durationMinutes: slot.serviceId.durationMinutes,
        startTime: slot.startTime,
        endTime: slot.endTime,
    }));
};
exports.getPublicCreatorSlotsData = getPublicCreatorSlotsData;
