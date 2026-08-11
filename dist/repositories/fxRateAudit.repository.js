"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fxRateAuditRepository = exports.FxRateAuditRepository = void 0;
const fxRateAudit_model_1 = require("../models/fxRateAudit.model");
class FxRateAuditRepository {
    async createOnce(data, session) {
        const existing = await fxRateAudit_model_1.FxRateAudit.findOne({ auditKey: data.auditKey })
            .session(session ?? null).exec();
        if (existing)
            return existing;
        try {
            const [created] = await fxRateAudit_model_1.FxRateAudit.create([data], { session });
            return created;
        }
        catch (error) {
            if (error?.code !== 11000)
                throw error;
            const raced = await fxRateAudit_model_1.FxRateAudit.findOne({ auditKey: data.auditKey })
                .session(session ?? null).exec();
            if (raced)
                return raced;
            throw error;
        }
    }
}
exports.FxRateAuditRepository = FxRateAuditRepository;
exports.fxRateAuditRepository = new FxRateAuditRepository();
