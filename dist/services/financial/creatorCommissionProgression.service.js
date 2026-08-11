"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creatorCommissionProgressionService = exports.CreatorCommissionProgressionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const creatorCommissionTier_enum_1 = require("../../enums/financial/creatorCommissionTier.enum");
const creatorCommissionProgression_repository_1 = require("../../repositories/creatorCommissionProgression.repository");
const creatorMonthlySettlementActivity_repository_1 = require("../../repositories/creatorMonthlySettlementActivity.repository");
const monthKeyFor = (settledAt) => {
    const year = settledAt.getUTCFullYear();
    const month = String(settledAt.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
};
const tierFor = (qualifiedMonths) => {
    if (qualifiedMonths >= 24)
        return { tier: creatorCommissionTier_enum_1.CreatorCommissionTier.TIER_THREE, rateBps: 1000 };
    if (qualifiedMonths >= 12)
        return { tier: creatorCommissionTier_enum_1.CreatorCommissionTier.TIER_TWO, rateBps: 1500 };
    return { tier: creatorCommissionTier_enum_1.CreatorCommissionTier.TIER_ONE, rateBps: 2000 };
};
/** Called only by a future successful-final-settlement authority. */
class CreatorCommissionProgressionService {
    async recordSuccessfulSettlement(input, session) {
        if (!session.inTransaction())
            throw new Error("Commission progression requires an active transaction.");
        const monthKey = monthKeyFor(input.settledAt);
        const replay = await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.findOperationBySettlement(input.settlementId, session);
        if (replay)
            return;
        await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.createOperation({
            settlementId: new mongoose_1.default.Types.ObjectId(input.settlementId),
            bookingId: new mongoose_1.default.Types.ObjectId(input.bookingId),
            creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
            monthKey,
        }, session);
        let activity = await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.findByCreatorAndMonth(input.creatorId, monthKey, session);
        if (!activity) {
            activity = await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.createActivity({
                creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId), monthKey,
            }, session);
        }
        if (activity.isQualified)
            return;
        const count = activity.successfullySettledBookingCount + 1;
        if (count < 5) {
            await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.updateActivity(activity._id.toString(), { successfullySettledBookingCount: count }, session);
            return;
        }
        const qualifiedAt = new Date();
        await creatorMonthlySettlementActivity_repository_1.creatorMonthlySettlementActivityRepository.updateActivity(activity._id.toString(), {
            successfullySettledBookingCount: count,
            isQualified: true,
            qualifiedAt,
            qualifyingSettlementId: new mongoose_1.default.Types.ObjectId(input.settlementId),
        }, session);
        let progression = await creatorCommissionProgression_repository_1.creatorCommissionProgressionRepository.findByCreatorId(input.creatorId, session);
        if (!progression) {
            const current = tierFor(1);
            await creatorCommissionProgression_repository_1.creatorCommissionProgressionRepository.create({ creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId), qualifiedActiveMonthCount: 1, currentTier: current.tier, currentCommissionRateBps: current.rateBps, lastQualifiedMonth: monthKey }, session);
            return;
        }
        const nextCount = progression.qualifiedActiveMonthCount + 1;
        const next = tierFor(nextCount);
        await creatorCommissionProgression_repository_1.creatorCommissionProgressionRepository.updateByCreatorId(input.creatorId, {
            qualifiedActiveMonthCount: nextCount, currentTier: next.tier, currentCommissionRateBps: next.rateBps, lastQualifiedMonth: monthKey,
        }, session);
    }
}
exports.CreatorCommissionProgressionService = CreatorCommissionProgressionService;
exports.creatorCommissionProgressionService = new CreatorCommissionProgressionService();
