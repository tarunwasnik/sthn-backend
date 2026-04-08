"use strict";
//backend/src/controllers/public/publicHome.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicHome = void 0;
const publicHome_service_1 = require("../../services/public/publicHome.service");
const getPublicHome = async (req, res) => {
    try {
        const data = await (0, publicHome_service_1.getPublicHomeData)();
        // During development disable caching
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json(data);
    }
    catch (error) {
        console.error("Public Home Error:", error);
        return res.status(500).json({
            message: "Failed to load public home data",
        });
    }
};
exports.getPublicHome = getPublicHome;
