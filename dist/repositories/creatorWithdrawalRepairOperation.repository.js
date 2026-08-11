"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorWithdrawalRepairOperationRepository = exports.CreatorWithdrawalRepairOperationRepository = void 0;
const creatorWithdrawalRepairOperation_model_1 = require("../models/creatorWithdrawalRepairOperation.model");
class CreatorWithdrawalRepairOperationRepository {
    findByKey(key, session) {
        return creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.findOne({ repairKey: key })
            .select("+repairKey +snapshotFingerprint +performedBy +withdrawalRequestId")
            .session(session ?? null).exec();
    }
    findApplied(reconciliationReference, action) {
        return creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.findOne({
            reconciliationReference, action, status: "APPLIED",
        }).sort({ createdAt: -1 }).exec();
    }
    create(data, session) {
        return creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.create([{
                ...data, status: "STARTED", repairedFields: [], version: 0,
            }], { session }).then(([record]) => record);
    }
    complete(key, repairedFields, at, session) {
        return creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.findOneAndUpdate({
            repairKey: key, status: "STARTED", version: 0,
        }, { $set: { status: "APPLIED", resultCode: "METADATA_RESTORED",
                repairedFields, performedAt: at }, $inc: { version: 1 } }, { new: true, runValidators: true, session }).select("+repairKey").exec();
    }
}
exports.CreatorWithdrawalRepairOperationRepository = CreatorWithdrawalRepairOperationRepository;
exports.creatorWithdrawalRepairOperationRepository = new CreatorWithdrawalRepairOperationRepository();
