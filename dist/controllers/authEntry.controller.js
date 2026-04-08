"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authEntry = void 0;
const entryResolver_service_1 = require("../services/entryResolver.service");
const authEntry = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unauthenticated" });
        }
        const entry = (0, entryResolver_service_1.resolveEntry)(user);
        return res.status(200).json(entry);
    }
    catch (err) {
        return res.status(403).json({
            message: err.message || "Access denied",
        });
    }
};
exports.authEntry = authEntry;
