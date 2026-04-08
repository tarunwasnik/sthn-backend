"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicCategories = void 0;
const publicCategory_service_1 = require("../../services/public/publicCategory.service");
/**
 * GET /public/categories
 * Public categories for Explore page
 */
const getPublicCategories = async (req, res) => {
    try {
        const data = await (0, publicCategory_service_1.getPublicCategoriesData)();
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.status(200).json(data);
    }
    catch {
        return res.status(500).json({
            message: "Failed to load public categories",
        });
    }
};
exports.getPublicCategories = getPublicCategories;
