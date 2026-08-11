import { ClientSession } from "mongoose";

import {
  WalletProjectionOperation,
  WalletProjectionOperationDocument,
} from "../../models/walletProjectionOperation.model";

export class WalletProjectionOperationRepository {
  async findById(id: import("mongoose").Types.ObjectId): Promise<WalletProjectionOperationDocument | null> { return WalletProjectionOperation.findById(id).select("+fingerprint").exec(); }
  async create(
    data: Partial<WalletProjectionOperationDocument>,
    session: ClientSession,
  ): Promise<WalletProjectionOperationDocument> {
    const [operation] = await WalletProjectionOperation.create([data], { session });
    return operation;
  }

  async findByOperationKey(
    operationKey: string,
    session?: ClientSession,
  ): Promise<WalletProjectionOperationDocument | null> {
    return WalletProjectionOperation.findOne({ operationKey })
      .select("+fingerprint")
      .session(session ?? null)
      .exec();
  }
}

export const walletProjectionOperationRepository = new WalletProjectionOperationRepository();
