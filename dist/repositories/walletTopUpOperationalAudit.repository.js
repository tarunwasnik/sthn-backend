"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpOperationalAuditRepository = exports.WalletTopUpOperationalAuditRepository = void 0;
const walletTopUpOperationalAudit_model_1 = require("../models/walletTopUpOperationalAudit.model");
class WalletTopUpOperationalAuditRepository {
    create(input) {
        return walletTopUpOperationalAudit_model_1.WalletTopUpOperationalAudit.create(input);
    }
}
exports.WalletTopUpOperationalAuditRepository = WalletTopUpOperationalAuditRepository;
exports.walletTopUpOperationalAuditRepository = new WalletTopUpOperationalAuditRepository();
