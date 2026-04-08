"use strict";
//backend/src/controlllers/controlPlaneFeatureFlags.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFeatureFlag = exports.toggleFeatureFlag = exports.updateFeatureFlag = exports.createFeatureFlag = exports.listFeatureFlags = void 0;
const featureFlag_service_1 = require("../services/controlPlane/featureFlag.service");
const listFeatureFlags = async (req, res) => {
    const flags = await featureFlag_service_1.FeatureFlagService.getAll();
    res.json({ success: true, data: flags });
};
exports.listFeatureFlags = listFeatureFlags;
const createFeatureFlag = async (req, res) => {
    const adminId = req.user.id;
    const flag = await featureFlag_service_1.FeatureFlagService.create(req.body, adminId);
    res.status(201).json({ success: true, data: flag });
};
exports.createFeatureFlag = createFeatureFlag;
const updateFeatureFlag = async (req, res) => {
    const adminId = req.user.id;
    const { flagId } = req.params;
    const flag = await featureFlag_service_1.FeatureFlagService.update(flagId, req.body, adminId);
    res.json({ success: true, data: flag });
};
exports.updateFeatureFlag = updateFeatureFlag;
const toggleFeatureFlag = async (req, res) => {
    const adminId = req.user.id;
    const { flagId } = req.params;
    const { enabled } = req.body;
    const flag = await featureFlag_service_1.FeatureFlagService.toggle(flagId, enabled, adminId);
    res.json({ success: true, data: flag });
};
exports.toggleFeatureFlag = toggleFeatureFlag;
const deleteFeatureFlag = async (req, res) => {
    const { flagId } = req.params;
    await featureFlag_service_1.FeatureFlagService.remove(flagId);
    res.json({ success: true });
};
exports.deleteFeatureFlag = deleteFeatureFlag;
