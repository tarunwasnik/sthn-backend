import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpRetryAttempt } from "../models/walletTopUpRetryAttempt.model";
import { Types } from "mongoose";

export class WalletTopUpRetryAttemptRepository {
  create(input: {
    operationKey: string;
    reconciliationReference: string;
    topUpReference: string;
    attemptNumber: number;
    action: WalletTopUpOperationalAction;
    actorId: Types.ObjectId;
    startedAt: Date;
  }) {
    return WalletTopUpRetryAttempt.create({ ...input, actorType: "ADMIN" });
  }

  complete(operationKey: string, input: {
    completedAt: Date;
    resultCode: string;
    safeErrorCode?: string;
    nextRetryAt?: Date;
  }) {
    return WalletTopUpRetryAttempt.findOneAndUpdate(
      { operationKey, completedAt: { $exists: false } },
      { $set: input },
      { new: true, runValidators: true },
    ).exec();
  }
}

export const walletTopUpRetryAttemptRepository = new WalletTopUpRetryAttemptRepository();
