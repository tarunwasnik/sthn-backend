"use strict";
//backend/src/middlewares/creator.middleware.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveCreator = void 0;
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const creatorStatus_1 = require("../constants/creatorStatus");
const roles_1 = require("../constants/roles");
const requireActiveCreator = async (req, res, next) => {
    const user = req.user;
    // Must be authenticated
    if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
    }
    // Must have creator role
    if (user.role !== roles_1.ROLES.CREATOR) {
        return res
            .status(403)
            .json({ message: "Creator access required" });
    }
    // Must have an active creator profile
    const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
        userId: user.id,
    });
    if (!creatorProfile) {
        return res
            .status(403)
            .json({ message: "Creator profile not found" });
    }
    if (creatorProfile.status !== creatorStatus_1.CREATOR_STATUS.ACTIVE) {
        return res.status(403).json({
            message: "Creator account is not active",
        });
    }
    // Attach creatorProfile for downstream use
    req.creatorProfile = creatorProfile;
    next();
};
exports.requireActiveCreator = requireActiveCreator;
