"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authEntry = void 0;
const entryResolver_service_1 = require("../services/entryResolver.service");
const userProfile_model_1 = require("../models/userProfile.model");
const authEntry = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthenticated" });
        }
        const profile = await userProfile_model_1.UserProfile.findOne({ userId: user.id ?? user._id }).select("profileStatus").lean();
        const entry = profile?.profileStatus === "incomplete" && user.status === "active"
            ? { entryType: "ONBOARDING", entryRoute: "/onboarding", userId: String(user.id ?? user._id) }
            : (0, entryResolver_service_1.resolveEntry)(user);
        return res.status(200).json(entry);
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "Access denied",
        });
    }
};
exports.authEntry = authEntry;
