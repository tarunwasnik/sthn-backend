"use strict";
//backend/src/rervices/controlPlane/controlPlane.repository.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPlaneRepository = void 0;
const controlPlaneControl_model_1 = require("../../models/controlPlaneControl.model");
class ControlPlaneRepository {
    static async fetchActiveControls() {
        const now = new Date();
        const controls = await controlPlaneControl_model_1.ControlPlaneControl.find({
            isActive: true,
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: now } },
            ],
        })
            .sort({ createdAt: -1 })
            .lean()
            .exec();
        return controls.map(ControlPlaneRepository.toRule);
    }
    static async createControl(input) {
        const control = await controlPlaneControl_model_1.ControlPlaneControl.create(input);
        return ControlPlaneRepository.toRule(control.toObject());
    }
    static async deactivateControl(controlId) {
        await controlPlaneControl_model_1.ControlPlaneControl.updateOne({ _id: controlId }, { $set: { isActive: false } }).exec();
    }
    static toRule(doc) {
        return {
            id: doc._id.toString(),
            scope: doc.scope,
            target: doc.target ?? null,
            enforcement: doc.enforcement,
            reason: doc.reason,
            isActive: doc.isActive,
            expiresAt: doc.expiresAt ?? undefined,
            createdAt: doc.createdAt,
        };
    }
}
exports.ControlPlaneRepository = ControlPlaneRepository;
