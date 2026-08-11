"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpOperationalAuditService = exports.WalletTopUpOperationalAuditService = void 0;
const reference_util_1 = require("../../utils/financial/reference.util");
const walletTopUpOperationalAudit_repository_1 = require("../../repositories/walletTopUpOperationalAudit.repository");
class WalletTopUpOperationalAuditService {
    async record(input) {
        if (input.actorType === "ADMIN" && !input.actorId) {
            throw new Error("Operational audit requires authenticated Admin identity.");
        }
        await walletTopUpOperationalAudit_repository_1.walletTopUpOperationalAuditRepository.create({
            ...input,
            auditReference: (0, reference_util_1.generateFinancialReference)("AUDIT"),
            createdAt: new Date(),
        });
    }
}
exports.WalletTopUpOperationalAuditService = WalletTopUpOperationalAuditService;
exports.walletTopUpOperationalAuditService = new WalletTopUpOperationalAuditService();
