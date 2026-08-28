"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxRateSnapshotController = exports.FxRateSnapshotController = void 0;
const mongoose_1 = require("mongoose");
const FxRateSnapshotError_1 = require("../errors/financial/FxRateSnapshotError");
const fxRateSnapshot_service_1 = require("../services/financial/fxRateSnapshot.service");
class FxRateSnapshotController {
    async list(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({ success: false, message: "Unauthorized" });
            const data = await fxRateSnapshot_service_1.fxRateSnapshotService.getAdminReadState();
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async refresh(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({
                    success: false, message: "Unauthorized",
                });
            const body = req.body;
            if (!body || typeof body !== "object" || Array.isArray(body) ||
                Object.keys(body).some((key) => !["baseCurrency", "quoteCurrency", "force"].includes(key)) ||
                typeof body.baseCurrency !== "string" ||
                typeof body.quoteCurrency !== "string" ||
                (body.force !== undefined && typeof body.force !== "boolean")) {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("FX refresh request is invalid.", "FX_RATE_PAIR_NOT_SUPPORTED", 400);
            }
            const data = await fxRateSnapshot_service_1.fxRateSnapshotService.refresh(body.baseCurrency, body.quoteCurrency, body.force ?? true, { type: "ADMIN", id: new mongoose_1.Types.ObjectId(req.user.id) });
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async current(req, res, next) {
        try {
            if (!req.user)
                return res.status(401).json({
                    success: false, message: "Unauthorized",
                });
            const data = await fxRateSnapshot_service_1.fxRateSnapshotService.getCurrent(req.params.baseCurrency, req.params.quoteCurrency);
            return res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.FxRateSnapshotController = FxRateSnapshotController;
exports.fxRateSnapshotController = new FxRateSnapshotController();
