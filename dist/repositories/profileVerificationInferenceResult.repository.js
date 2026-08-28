"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileVerificationInferenceResultRepository = exports.ProfileVerificationInferenceResultRepository = void 0;
const profileVerificationInferenceResult_model_1 = require("../models/profileVerificationInferenceResult.model");
class ProfileVerificationInferenceResultRepository {
    findByRunFingerprint(inferenceRunFingerprint) {
        return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.findOne({ inferenceRunFingerprint }).exec();
    }
    create(input) {
        return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.create(input);
    }
    shortenRetentionDeadline(id, existingDeadline, proposedDeadline) {
        const deadline = new Date(Math.min(existingDeadline.getTime(), proposedDeadline.getTime()));
        return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.findOneAndUpdate({ _id: id, retentionDeadline: { $gt: deadline } }, { $set: { retentionDeadline: deadline } }, { new: true, runValidators: true }).exec();
    }
    shortenRetentionForRequest(requestId, proposedDeadline) {
        return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.updateMany({ verificationRequestId: requestId, retentionDeadline: { $gt: proposedDeadline } }, [{ $set: { retentionDeadline: { $min: ["$retentionDeadline", proposedDeadline] } } }]).exec();
    }
    listDueForDeletion(now, limit = 50) {
        return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.find({ retentionDeadline: { $lte: now } }).sort({ retentionDeadline: 1, _id: 1 }).limit(limit).exec();
    }
    deleteById(id) { return profileVerificationInferenceResult_model_1.ProfileVerificationInferenceResult.deleteOne({ _id: id }).exec(); }
}
exports.ProfileVerificationInferenceResultRepository = ProfileVerificationInferenceResultRepository;
exports.profileVerificationInferenceResultRepository = new ProfileVerificationInferenceResultRepository();
