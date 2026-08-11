"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTopUpRepairOperationRepository = exports.WalletTopUpRepairOperationRepository = void 0;
const walletTopUpRepairOperation_model_1 = require("../models/walletTopUpRepairOperation.model");
class WalletTopUpRepairOperationRepository {
    findByOperationKey(operationKey) {
        return walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.findOne({ operationKey })
            .select("+operationKey +snapshotFingerprint +actorId")
            .exec();
    }
    findLatestApplied(reconciliationReference, action) {
        return walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.findOne({
            reconciliationReference,
            action,
            status: "APPLIED",
        }).sort({ createdAt: -1 }).exec();
    }
    create(input) {
        return walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.create({ ...input, status: "STARTED", repairedFields: [] });
    }
    complete(operationKey, repairedFields, appliedAt) {
        return walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.findOneAndUpdate({ operationKey, status: "STARTED" }, { $set: { status: "APPLIED", repairedFields, appliedAt, resultCode: "REPAIR_APPLIED" } }, { new: true, runValidators: true }).exec();
    }
    reject(operationKey, resultCode) {
        return walletTopUpRepairOperation_model_1.WalletTopUpRepairOperation.findOneAndUpdate({ operationKey, status: "STARTED" }, { $set: { status: "REJECTED", resultCode } }, { new: true, runValidators: true }).exec();
    }
}
exports.WalletTopUpRepairOperationRepository = WalletTopUpRepairOperationRepository;
exports.walletTopUpRepairOperationRepository = new WalletTopUpRepairOperationRepository();
