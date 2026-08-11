import { ClientSession } from "mongoose";

import {
  BookingCreatorSettlementRepairOperation,
  BookingCreatorSettlementRepairOperationDocument,
} from "../models/bookingCreatorSettlementRepairOperation.model";

export class BookingCreatorSettlementRepairOperationRepository {
  findByOperationKey(operationKey: string, session?: ClientSession) {
    return BookingCreatorSettlementRepairOperation.findOne({ operationKey })
      .select("+operationKey +snapshotFingerprint +actorId")
      .session(session ?? null).exec();
  }

  async create(
    input: Partial<BookingCreatorSettlementRepairOperationDocument>,
    session: ClientSession,
  ) {
    const [operation] = await BookingCreatorSettlementRepairOperation.create(
      [{ ...input, status: "STARTED", repairedFields: [] }],
      { session },
    );
    return operation;
  }

  complete(
    operationKey: string,
    repairedFields: string[],
    appliedAt: Date,
    session: ClientSession,
  ) {
    return BookingCreatorSettlementRepairOperation.findOneAndUpdate({
      operationKey,
      status: "STARTED",
    }, {
      $set: {
        status: "APPLIED",
        repairedFields,
        appliedAt,
        resultCode: "REPAIR_APPLIED",
      },
    }, { new: true, runValidators: true, session }).exec();
  }
}

export const bookingCreatorSettlementRepairOperationRepository =
  new BookingCreatorSettlementRepairOperationRepository();
