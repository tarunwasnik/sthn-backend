"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeatureFlagEvents = void 0;
const featureFlagEvent_model_1 = require("../models/featureFlagEvent.model");
const getFeatureFlagEvents = async (req, res) => {
    const { flagKey, role, userId, from, to, limit = 50, page = 1, } = req.query;
    const query = {};
    if (flagKey)
        query.flagKey = flagKey;
    if (role)
        query.role = role;
    if (userId)
        query.userId = userId;
    if (from || to) {
        query.timestamp = {};
        if (from)
            query.timestamp.$gte = new Date(from);
        if (to)
            query.timestamp.$lte = new Date(to);
    }
    const pageNum = Math.max(Number(page), 1);
    const pageSize = Math.min(Number(limit), 100);
    const [events, total] = await Promise.all([
        featureFlagEvent_model_1.FeatureFlagEvent.find(query)
            .sort({ timestamp: -1 })
            .skip((pageNum - 1) * pageSize)
            .limit(pageSize),
        featureFlagEvent_model_1.FeatureFlagEvent.countDocuments(query),
    ]);
    return res.json({
        data: events,
        meta: {
            page: pageNum,
            limit: pageSize,
            total,
        },
    });
};
exports.getFeatureFlagEvents = getFeatureFlagEvents;
