"use strict";
// backend/src/controllers/creatorService.controller.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCreatorService = exports.updateCreatorService = exports.getMyServices = exports.createCreatorService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorService_model_1 = require("../models/creatorService.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const AppError_1 = require("../utils/AppError");
const cloudinary_1 = __importStar(require("../config/cloudinary"));
/**
 * CREATE SERVICE
 */
const createCreatorService = async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        throw new AppError_1.AppError("Unauthorized", 401);
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
    if (typeof durationMinutes !== "number" ||
        durationMinutes < 15 ||
        durationMinutes > 480) {
        throw new AppError_1.AppError("Invalid durationMinutes", 400);
    }
    if (typeof price !== "number" || price < 0) {
        throw new AppError_1.AppError("Invalid price", 400);
    }
    const service = await creatorService_model_1.CreatorService.create({
        creatorId: creatorObjectId,
        title,
        description,
        durationMinutes,
        price,
        currency: creatorProfile.currency,
        media: Array.isArray(media) ? media : [],
    });
    res.status(201).json({
        message: "Service created successfully",
        service,
    });
};
exports.createCreatorService = createCreatorService;
/**
 * GET SERVICES
 */
const getMyServices = async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        throw new AppError_1.AppError("Unauthorized", 401);
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
 * UPDATE SERVICE (WITH MEDIA CLEANUP)
 */
const updateCreatorService = async (req, res) => {
    const userId = req.user?.id;
    const { serviceId } = req.params;
    if (!userId)
        throw new AppError_1.AppError("Unauthorized", 401);
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        throw new AppError_1.AppError("Invalid service ID", 400);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const service = await creatorService_model_1.CreatorService.findOne({
        _id: serviceId,
        creatorId: creatorObjectId,
    });
    if (!service)
        throw new AppError_1.AppError("Service not found", 404);
    const { title, description, durationMinutes, price, media, isActive, } = req.body;
    /* ================= MEDIA CLEANUP ================= */
    if (media !== undefined) {
        if (!Array.isArray(media)) {
            throw new AppError_1.AppError("Media must be an array", 400);
        }
        const oldMedia = service.media || [];
        const removedMedia = oldMedia.filter((url) => !media.includes(url));
        for (const url of removedMedia) {
            const publicId = (0, cloudinary_1.extractPublicId)(url);
            if (publicId) {
                try {
                    await cloudinary_1.default.uploader.destroy(publicId);
                }
                catch (err) {
                    console.error("Cloudinary delete failed:", publicId);
                }
            }
        }
        service.media = media;
    }
    /* ================= OTHER FIELDS ================= */
    if (title !== undefined)
        service.title = title;
    if (description !== undefined)
        service.description = description;
    if (durationMinutes !== undefined) {
        if (typeof durationMinutes !== "number" ||
            durationMinutes < 15 ||
            durationMinutes > 480) {
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
 * DELETE SERVICE + MEDIA CLEANUP (HARD DELETE)
 */
const deleteCreatorService = async (req, res) => {
    const userId = req.user?.id;
    const { serviceId } = req.params;
    if (!userId)
        throw new AppError_1.AppError("Unauthorized", 401);
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        throw new AppError_1.AppError("Invalid service ID", 400);
    }
    const creatorObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const service = await creatorService_model_1.CreatorService.findOne({
        _id: serviceId,
        creatorId: creatorObjectId,
    });
    if (!service)
        throw new AppError_1.AppError("Service not found", 404);
    /* ================= DELETE ALL MEDIA ================= */
    if (service.media?.length) {
        for (const url of service.media) {
            const publicId = (0, cloudinary_1.extractPublicId)(url);
            if (publicId) {
                try {
                    await cloudinary_1.default.uploader.destroy(publicId);
                }
                catch (err) {
                    console.error("Cloudinary delete failed:", publicId);
                }
            }
        }
    }
    /* ================= HARD DELETE ================= */
    await creatorService_model_1.CreatorService.findByIdAndDelete(serviceId);
    res.status(200).json({
        message: "Service and media deleted successfully",
    });
};
exports.deleteCreatorService = deleteCreatorService;
