"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorMonthlySettlementActivityRepository = exports.CreatorMonthlySettlementActivityRepository = void 0;
const creatorMonthlySettlementActivity_model_1 = require("../models/creatorMonthlySettlementActivity.model");
const creatorSettlementQualificationOperation_model_1 = require("../models/creatorSettlementQualificationOperation.model");
class CreatorMonthlySettlementActivityRepository {
    findByCreatorAndMonth(creatorId, monthKey, session) {
        return creatorMonthlySettlementActivity_model_1.CreatorMonthlySettlementActivity.findOne({ creatorId, monthKey }).session(session).exec();
    }
    createActivity(data, session) { return new creatorMonthlySettlementActivity_model_1.CreatorMonthlySettlementActivity(data).save({ session }); }
    updateActivity(id, update, session) { return creatorMonthlySettlementActivity_model_1.CreatorMonthlySettlementActivity.findByIdAndUpdate(id, update, { new: true, runValidators: true, session }).exec(); }
    findOperationBySettlement(settlementId, session) { return creatorSettlementQualificationOperation_model_1.CreatorSettlementQualificationOperation.findOne({ settlementId }).session(session).exec(); }
    createOperation(data, session) { return new creatorSettlementQualificationOperation_model_1.CreatorSettlementQualificationOperation(data).save({ session }); }
}
exports.CreatorMonthlySettlementActivityRepository = CreatorMonthlySettlementActivityRepository;
exports.creatorMonthlySettlementActivityRepository = new CreatorMonthlySettlementActivityRepository();
