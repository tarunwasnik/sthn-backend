import { Types } from "mongoose";
import { WalletTopUpOperationalAction } from "../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpRepairOperation } from "../models/walletTopUpRepairOperation.model";

export class WalletTopUpRepairOperationRepository {
  findByOperationKey(operationKey: string) {
    return WalletTopUpRepairOperation.findOne({ operationKey })
      .select("+operationKey +snapshotFingerprint +actorId")
      .exec();
  }

  findLatestApplied(reconciliationReference: string, action: WalletTopUpOperationalAction) {
    return WalletTopUpRepairOperation.findOne({
      reconciliationReference,
      action,
      status: "APPLIED",
    }).sort({ createdAt: -1 }).exec();
  }

  create(input: {
    operationReference: string;
    operationKey: string;
    reconciliationReference: string;
    topUpReference: string;
    action: WalletTopUpOperationalAction;
    snapshotFingerprint: string;
    actorId: Types.ObjectId;
  }) {
    return WalletTopUpRepairOperation.create({ ...input, status: "STARTED", repairedFields: [] });
  }

  complete(operationKey: string, repairedFields: string[], appliedAt: Date) {
    return WalletTopUpRepairOperation.findOneAndUpdate(
      { operationKey, status: "STARTED" },
      { $set: { status: "APPLIED", repairedFields, appliedAt, resultCode: "REPAIR_APPLIED" } },
      { new: true, runValidators: true },
    ).exec();
  }

  reject(operationKey: string, resultCode: string) {
    return WalletTopUpRepairOperation.findOneAndUpdate(
      { operationKey, status: "STARTED" },
      { $set: { status: "REJECTED", resultCode } },
      { new: true, runValidators: true },
    ).exec();
  }
}

export const walletTopUpRepairOperationRepository = new WalletTopUpRepairOperationRepository();
