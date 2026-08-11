import { BookingCreatorSettlement } from "../../../../models/bookingCreatorSettlement.model";
import { bookingCreatorSettlementService } from "../../../../services/financial/bookingCreatorSettlement.service";
import {
  createAllocatedCreatorSettlementFixture,
  startSettlementHttpServer,
} from "../../phase8e/fixtures/bookingCreatorSettlementFixtures";

export const startOperationalHttpServer = startSettlementHttpServer;

export const createSettledOperationalFixture = async (baseUrl: string) => {
  const fixture = await createAllocatedCreatorSettlementFixture(baseUrl);
  await bookingCreatorSettlementService.settle(fixture.booking._id.toString());
  const settlement = await BookingCreatorSettlement.findOne({
    bookingId: fixture.booking._id,
  }).select(
    "+settlementKey +captureTransactionId +allocationTransactionId " +
    "+settlementTransactionId +settlementFingerprint " +
    "+settlementProjectionOperationReference +settlementLedgerEntryIds",
  ).orFail();
  return { ...fixture, settlement };
};
