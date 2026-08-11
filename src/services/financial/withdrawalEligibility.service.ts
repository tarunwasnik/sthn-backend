import mongoose from "mongoose";

import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { WithdrawalEligibilityReason } from "../../enums/financial/withdrawalEligibilityReason.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { withdrawalRepository } from "../../repositories/withdrawal.repository";
import { Money } from "../../types/financial/money.type";
import { isValidMoney } from "../../utils/financial/money.util";
import { resolveAccountGovernance } from "../accountGovernance/accountGovernanceResolver.service";
import { creatorBalanceService } from "./creatorBalance.service";
import { payoutDestinationService } from "./payoutDestination.service";

export type WithdrawalEligibilityResult =
  | { allowed: true }
  | { allowed: false; reason: WithdrawalEligibilityReason };

export interface EvaluateWithdrawalEligibilityInput {
  creatorId: string;
  amount: Money;
  destinationReference: string;
  balanceSnapshot?: {
    currency: Money["currency"];
    availableBalance: number;
  };
}

/** Read-only early policy; reservation transaction remains the concurrency authority. */
export class WithdrawalEligibilityService {
  async evaluate(
    input: EvaluateWithdrawalEligibilityInput,
  ): Promise<WithdrawalEligibilityResult> {
    if (
      !mongoose.Types.ObjectId.isValid(input.creatorId) ||
      !isValidMoney(input.amount) ||
      input.amount.amount <= 0
    ) {
      return this.deny(WithdrawalEligibilityReason.INVALID_AMOUNT);
    }

    if (
      typeof input.destinationReference !== "string" ||
      !input.destinationReference.trim()
    ) {
      return this.deny(WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
    }

    const creator = await CreatorProfile.findOne({
      userId: input.creatorId,
    })
      .select("userId status")
      .lean();
    if (!creator || creator.status !== "active") {
      return this.deny(WithdrawalEligibilityReason.CREATOR_INACTIVE);
    }

    const user = await User.findById(input.creatorId);
    if (!user || resolveAccountGovernance(user).hasNoAccountAccess) {
      return this.deny(WithdrawalEligibilityReason.GOVERNANCE_BLOCK);
    }

    try {
      const destination = await payoutDestinationService.get(
        input.creatorId,
        input.destinationReference,
      );
      if (
        destination.verificationStatus !==
          PayoutDestinationVerificationStatus.VERIFIED ||
        !destination.isActive
      ) {
        return this.deny(WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
      }
    } catch {
      return this.deny(WithdrawalEligibilityReason.NO_VERIFIED_DESTINATION);
    }

    const limitDenial = this.configuredLimitDenial(input.amount);
    if (limitDenial) return limitDenial;

    try {
      const balance = input.balanceSnapshot ??
        await creatorBalanceService.getBalance(input.creatorId);
      if (balance.currency !== input.amount.currency) {
        return this.deny(WithdrawalEligibilityReason.UNSUPPORTED_CURRENCY);
      }
      if (balance.availableBalance < input.amount.amount) {
        return this.deny(WithdrawalEligibilityReason.INSUFFICIENT_BALANCE);
      }
    } catch {
      return this.deny(WithdrawalEligibilityReason.INSUFFICIENT_BALANCE);
    }

    if (await withdrawalRepository.findActiveByCreator(input.creatorId)) {
      return this.deny(WithdrawalEligibilityReason.PENDING_WITHDRAWAL);
    }

    return { allowed: true };
  }

  private configuredLimitDenial(
    _amount: Money,
  ): WithdrawalEligibilityResult | undefined {
    return undefined;
  }

  private deny(reason: WithdrawalEligibilityReason): WithdrawalEligibilityResult {
    return { allowed: false, reason };
  }
}

export const withdrawalEligibilityService = new WithdrawalEligibilityService();
