"use strict";
// backend/src/controllers/creatorService.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCreatorService = exports.updateCreatorService = exports.getMyServices = exports.createCreatorService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorService_model_1 = require("../models/creatorService.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const AppError_1 = require("../utils/AppError");
/**
 * POST /api/v1/creator/services
 * Create new service
 */
const createCreatorService = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
        userId: creatorObjectId,
        status: "active",
    }).lean();
    if (!creatorProfile) {
        throw new AppError_1.AppError("Active creator profile not found", 403);
    }
    const { title, description, durationMinutes, price, media } = req.body;
    if (!title || !description || durationMinutes == null || price == null) {
        throw new AppError_1.AppError("Missing required fields", 400);
    }
    if (typeof durationMinutes !== "number" || durationMinutes < 15 || durationMinutes > 480) {
        throw new AppError_1.AppError("Invalid durationMinutes", 400);
    }
    if (typeof price !== "number" || price < 0) {
        throw new AppError_1.AppError("Invalid price", 400);
    }
    const normalizedMedia = Array.isArray(media) ? media : [];
    const service = await creatorService_model_1.CreatorService.create({
        creatorId: creatorObjectId,
        title,
        description,
        durationMinutes,
        price,
        media: normalizedMedia,
    });
    res.status(201).json({
        message: "Service created successfully",
        service,
    });
};
exports.createCreatorService = createCreatorService;
/**
 * GET /api/v1/creator/services
 * List my services
 */
const getMyServices = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const services = await creatorService_model_1.CreatorService.find({
        creatorId: creatorObjectId,
    })
        .sort({ createdAt: -1 })
        .lean();
    res.status(200).json({ services });
};
exports.getMyServices = getMyServices;
/**
 * PATCH /api/v1/creator/services/:serviceId
 * Update service
 */
const updateCreatorService = async (req, res) => {
    const userId = req.user?.id;
    const { serviceId } = req.params;
    if (!userId) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        throw new AppError_1.AppError("Invalid service ID", 400);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const service = await creatorService_model_1.CreatorService.findOne({
        _id: serviceId,
        creatorId: creatorObjectId,
    });
    if (!service) {
        throw new AppError_1.AppError("Service not found", 404);
    }
    const { title, description, durationMinutes, price, media, isActive } = req.body;
    if (title !== undefined)
        service.title = title;
    if (description !== undefined)
        service.description = description;
    if (durationMinutes !== undefined) {
        if (typeof durationMinutes !== "number" || durationMinutes < 15 || durationMinutes > 480) {
            throw new AppError_1.AppError("Invalid durationMinutes", 400);
        }
        service.durationMinutes = durationMinutes;
    }
    if (price !== undefined) {
        if (typeof price !== "number" || price < 0) {
            throw new AppError_1.AppError("Invalid price", 400);
        }
        service.price = price;
    }
    if (media !== undefined) {
        if (!Array.isArray(media)) {
            throw new AppError_1.AppError("Media must be an array", 400);
        }
        service.media = media;
    }
    if (isActive !== undefined) {
        service.isActive = isActive;
    }
    await service.save();
    res.status(200).json({
        message: "Service updated successfully",
        service,
    });
};
exports.updateCreatorService = updateCreatorService;
/**
 * DELETE /api/v1/creator/services/:serviceId
 * Soft delete
 */
const deleteCreatorService = async (req, res) => {
    const userId = req.user?.id;
    const { serviceId } = req.params;
    if (!userId) {
        throw new AppError_1.AppError("Unauthorized", 401);
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        throw new AppError_1.AppError("Invalid service ID", 400);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const service = await creatorService_model_1.CreatorService.findOne({
        _id: serviceId,
        creatorId: creatorObjectId,
    });
    if (!service) {
        throw new AppError_1.AppError("Service not found", 404);
    }
    service.isActive = false;
    await service.save();
    res.status(200).json({
        message: "Service disabled successfully",
    });
};
exports.deleteCreatorService = deleteCreatorService;
