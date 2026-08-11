"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalEligibilityService = exports.WithdrawalEligibilityService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../models/User"));
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const withdrawalEligibilityReason_enum_1 = require("../../enums/financial/withdrawalEligibilityReason.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const withdrawal_repository_1 = require("../../repositories/withdrawal.repository");
const money_util_1 = require("../../utils/financial/money.util");
const accountGovernanceResolver_service_1 = require("../accountGovernance/accountGovernanceResolver.service");
const creatorBalance_service_1 = require("./creatorBalance.service");
const payoutDestination_service_1 = require("./payoutDestination.service");
/** Read-only early policy; reservation transaction remains the concurrency authority. */
class WithdrawalEligibilityService {
    async evaluate(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.creatorId) ||
            !(0, money_util_1.isValidMoney)(input.amount) ||
            input.amount.amount <= 0) {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.INVALID_AMOUNT);
        }
        if (typeof input.destinationReference !== "string" ||
            !input.destinationReference.trim()) {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
        }
        const creator = await creatorProfile_model_1.CreatorProfile.findOne({
            userId: input.creatorId,
        })
            .select("userId status")
            .lean();
        if (!creator || creator.status !== "active") {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.CREATOR_INACTIVE);
        }
        const user = await User_1.default.findById(input.creatorId);
        if (!user || (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(user).hasNoAccountAccess) {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.GOVERNANCE_BLOCK);
        }
        try {
            const destination = await payoutDestination_service_1.payoutDestinationService.get(input.creatorId, input.destinationReference);
            if (destination.verificationStatus !==
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
                !destination.isActive) {
                return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
            }
        }
        catch {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
        }
        const limitDenial = this.configuredLimitDenial(input.amount);
        if (limitDenial)
            return limitDenial;
        try {
            const balance = input.balanceSnapshot ??
                await creatorBalance_service_1.creatorBalanceService.getBalance(input.creatorId);
            if (balance.currency !== input.amount.currency) {
                return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.UNSUPPORTED_CURRENCY);
            }
            if (balance.availableBalance < input.amount.amount) {
                return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.INSUFFICIENT_BALANCE);
            }
        }
        catch {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.INSUFFICIENT_BALANCE);
        }
        if (await withdrawal_repository_1.withdrawalRepository.findActiveByCreator(input.creatorId)) {
            return this.deny(withdrawalEligibilityReason_enum_1.WithdrawalEligibilityReason.PENDING_WITHDRAWAL);
        }
        return { allowed: true };
    }
    configuredLimitDenial(_amount) {
        return undefined;
    }
    deny(reason) {
        return { allowed: false, reason };
    }
}
exports.WithdrawalEligibilityService = WithdrawalEligibilityService;
exports.withdrawalEligibilityService = new WithdrawalEligibilityService();
