import { ClientSession } from "mongoose";

import { WalletConversionRepairOperation } from
  "../models/walletConversionRepairOperation.model";

export class WalletConversionRepairOperationRepository {
  findByKey(key: string, session?: ClientSession) {
    return WalletConversionRepairOperation.findOne({ repairKey: key })
      .select("+repairKey +performedBy").session(session ?? null).exec();
  }

  create(data: Record<string, unknown>, session: ClientSession) {
    return WalletConversionRepairOperation.create([data], { session })
      .then(([created]) => created);
  }
}

export const walletConversionRepairOperationRepository =
  new WalletConversionRepairOperationRepository();
