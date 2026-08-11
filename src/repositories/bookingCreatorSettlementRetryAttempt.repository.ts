import { ClientSession } from "mongoose";

import {
  BookingCreatorSettlementRetryAttempt,
  BookingCreatorSettlementRetryAttemptDocument,
} from "../models/bookingCreatorSettlementRetryAttempt.model";

export class BookingCreatorSettlementRetryAttemptRepository {
  findByOperationKey(operationKey: string, session?: ClientSession) {
    return BookingCreatorSettlementRetryAttempt.findOne({ operationKey })
      .select("+operationKey +actorId").session(session ?? null).exec();
  }

  async create(
    input: Partial<BookingCreatorSettlementRetryAttemptDocument>,
    session: ClientSession,
  ) {
    const [attempt] = await BookingCreatorSettlementRetryAttempt.create(
      [{ ...input, status: "STARTED" }],
      { session },
    );
    return attempt;
  }

  complete(
    operationKey: string,
    resultCode: string,
    completedAt: Date,
    session: ClientSession,
  ) {
    return BookingCreatorSettlementRetryAttempt.findOneAndUpdate({
      operationKey,
      status: "STARTED",
      completedAt: { $exists: false },
    }, {
      $set: { status: "APPLIED", resultCode, completedAt },
    }, { new: true, runValidators: true, session }).exec();
  }
}

export const bookingCreatorSettlementRetryAttemptRepository =
  new BookingCreatorSettlementRetryAttemptRepository();
