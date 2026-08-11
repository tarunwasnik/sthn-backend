import { ClientSession } from "mongoose";

import { WalletConversionRetryAttempt } from
  "../models/walletConversionRetryAttempt.model";

export class WalletConversionRetryAttemptRepository {
  findByKey(key: string, session?: ClientSession) {
    return WalletConversionRetryAttempt.findOne({ attemptKey: key })
      .select("+attemptKey +performedBy").session(session ?? null).exec();
  }

  create(data: Record<string, unknown>, session: ClientSession) {
    return WalletConversionRetryAttempt.create([data], { session })
      .then(([created]) => created);
  }
}

export const walletConversionRetryAttemptRepository =
  new WalletConversionRetryAttemptRepository();
