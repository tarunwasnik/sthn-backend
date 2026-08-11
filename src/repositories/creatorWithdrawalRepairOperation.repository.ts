import { ClientSession } from "mongoose";
import { CreatorWithdrawalRepairOperation } from
  "../models/creatorWithdrawalRepairOperation.model";

export class CreatorWithdrawalRepairOperationRepository {
  findByKey(key: string, session?: ClientSession) {
    return CreatorWithdrawalRepairOperation.findOne({ repairKey: key })
      .select("+repairKey +snapshotFingerprint +performedBy +withdrawalRequestId")
      .session(session ?? null).exec();
  }
  findApplied(reconciliationReference: string, action: string) {
    return CreatorWithdrawalRepairOperation.findOne({
      reconciliationReference, action, status: "APPLIED",
    }).sort({ createdAt: -1 }).exec();
  }
  create(data: Record<string, unknown>, session: ClientSession) {
    return CreatorWithdrawalRepairOperation.create([{
      ...data, status: "STARTED", repairedFields: [], version: 0,
    }], { session }).then(([record]) => record);
  }
  complete(key: string, repairedFields: string[], at: Date,
    session: ClientSession) {
    return CreatorWithdrawalRepairOperation.findOneAndUpdate({
      repairKey: key, status: "STARTED", version: 0,
    }, { $set: { status: "APPLIED", resultCode: "METADATA_RESTORED",
      repairedFields, performedAt: at }, $inc: { version: 1 } },
    { new: true, runValidators: true, session }).select("+repairKey").exec();
  }
}
export const creatorWithdrawalRepairOperationRepository =
  new CreatorWithdrawalRepairOperationRepository();
