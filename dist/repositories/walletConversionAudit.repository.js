"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionAuditRepository = exports.WalletConversionAuditRepository = void 0;
const walletConversionAudit_model_1 = require("../models/walletConversionAudit.model");
class WalletConversionAuditRepository {
    findByAuditKey(auditKey, session) {
        return walletConversionAudit_model_1.WalletConversionAudit.findOne({ auditKey })
            .select("+auditKey +adminActorId").session(session ?? null).exec();
    }
    async createOnce(data, session) {
        const existing = await walletConversionAudit_model_1.WalletConversionAudit.findOne({ auditKey: data.auditKey })
            .session(session).exec();
        if (existing)
            return existing;
        try {
            const [created] = await walletConversionAudit_model_1.WalletConversionAudit.create([data], { session });
            return created;
        }
        catch (error) {
            if (error?.code !== 11000)
                throw error;
            const raced = await walletConversionAudit_model_1.WalletConversionAudit.findOne({ auditKey: data.auditKey })
                .session(session).exec();
            if (raced)
                return raced;
            throw error;
        }
    }
}
exports.WalletConversionAuditRepository = WalletConversionAuditRepository;
exports.walletConversionAuditRepository = new WalletConversionAuditRepository();
