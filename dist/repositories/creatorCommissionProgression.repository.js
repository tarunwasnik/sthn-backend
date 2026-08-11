"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorCommissionProgressionRepository = exports.CreatorCommissionProgressionRepository = void 0;
const creatorCommissionProgression_model_1 = require("../models/creatorCommissionProgression.model");
class CreatorCommissionProgressionRepository {
    findByCreatorId(creatorId, session) {
        return creatorCommissionProgression_model_1.CreatorCommissionProgression.findOne({ creatorId }).session(session ?? null).exec();
    }
    create(data, session) {
        return new creatorCommissionProgression_model_1.CreatorCommissionProgression(data).save({ session });
    }
    updateByCreatorId(creatorId, update, session) {
        return creatorCommissionProgression_model_1.CreatorCommissionProgression.findOneAndUpdate({ creatorId }, update, { new: true, runValidators: true, session }).exec();
    }
}
exports.CreatorCommissionProgressionRepository = CreatorCommissionProgressionRepository;
exports.creatorCommissionProgressionRepository = new CreatorCommissionProgressionRepository();
