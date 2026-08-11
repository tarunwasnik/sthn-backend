"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutDestinationRepository = exports.PayoutDestinationRepository = void 0;
const payoutDestination_model_1 = require("../models/payoutDestination.model");
const payoutDestinationVerificationStatus_enum_1 = require("../enums/financial/payoutDestinationVerificationStatus.enum");
class PayoutDestinationRepository {
    async create(data, session) {
        if (!session) {
            return payoutDestination_model_1.PayoutDestination.create(data);
        }
        const [destination] = await payoutDestination_model_1.PayoutDestination.create([data], { session });
        return destination;
    }
    async findByCreatorAndIdempotencyKey(creatorId, idempotencyKey) {
        return payoutDestination_model_1.PayoutDestination.findOne({ creatorId, idempotencyKey })
            .select("+idempotencyKey +destinationFingerprint +requestFingerprint")
            .exec();
    }
    async findByCreatorTypeAndDestinationFingerprint(creatorId, type, destinationFingerprint) {
        return payoutDestination_model_1.PayoutDestination.findOne({ creatorId, type, destinationFingerprint })
            .select("+destinationFingerprint")
            .exec();
    }
    async findByCreatorAndReference(creatorId, destinationReference, session) {
        return payoutDestination_model_1.PayoutDestination.findOne({ creatorId, destinationReference })
            .session(session ?? null)
            .exec();
    }
    async claimEligibleForWithdrawalBinding(creatorId, destinationReference, session) {
        return payoutDestination_model_1.PayoutDestination.findOneAndUpdate({
            creatorId,
            destinationReference,
            verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED,
            isActive: true,
            verifiedAt: { $ne: null },
        }, { $inc: { withdrawalBindingRevision: 1 } }, { new: true, runValidators: true, session })
            .select("+encryptedPayload +destinationFingerprint +withdrawalBindingRevision")
            .exec();
    }
    async findManyByCreator(creatorId) {
        return payoutDestination_model_1.PayoutDestination.find({ creatorId }).sort({ createdAt: -1 }).exec();
    }
    async findByReferenceForVerification(destinationReference, session) {
        return payoutDestination_model_1.PayoutDestination.findOne({ destinationReference })
            .select("+verifiedBy +rejectedBy +rejectionCode +verificationNote")
            .session(session ?? null)
            .exec();
    }
    async transitionVerificationIfUnverified(destinationReference, expectedIsActive, update, session) {
        return payoutDestination_model_1.PayoutDestination.findOneAndUpdate({
            destinationReference,
            verificationStatus: "UNVERIFIED",
            isActive: expectedIsActive,
        }, update, { new: true, runValidators: true, session })
            .select("+rejectionCode")
            .exec();
    }
    async setActiveIfCurrent(creatorId, destinationReference, isActive, update) {
        const filter = {
            creatorId,
            destinationReference,
            isActive: !isActive,
        };
        if (isActive) {
            filter.verificationStatus = {
                $in: [
                    payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.UNVERIFIED,
                    payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED,
                ],
            };
        }
        return payoutDestination_model_1.PayoutDestination.findOneAndUpdate(filter, update, { new: true, runValidators: true }).exec();
    }
}
exports.PayoutDestinationRepository = PayoutDestinationRepository;
exports.payoutDestinationRepository = new PayoutDestinationRepository();
