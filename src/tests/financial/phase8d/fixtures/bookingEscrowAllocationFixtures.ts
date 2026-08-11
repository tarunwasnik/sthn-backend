import { Booking } from "../../../../models/booking.model";
import { BookingFundReservation } from "../../../../models/bookingFundReservation.model";
import { Payment } from "../../../../models/payment.model";
import {
  createAcceptedWalletBooking,
  postCreatorCompletion,
  startCaptureHttpServer,
} from "../../phase8c/fixtures/bookingWalletCaptureFixtures";
import { Phase7HActors } from "../../phase7h/fixtures/topUpFixtures";

let allocationFixtureSequence = 0;

export const startAllocationHttpServer = startCaptureHttpServer;

export const createCapturedWalletBooking = async (
  baseUrl: string,
  options: {
    walletAmount?: number;
    slotAmounts?: number[];
    actors?: Phase7HActors;
  } = {},
) => {
  allocationFixtureSequence += 1;
  const accepted = await createAcceptedWalletBooking(baseUrl, options);
  const completion = await postCreatorCompletion(
    baseUrl,
    accepted.booking._id.toString(),
    accepted.creatorToken,
  );
  if (completion.status !== 200) {
    throw new Error(
      `Phase 8D capture fixture failed: ${JSON.stringify(completion.body)}`,
    );
  }
  const booking = await Booking.findById(accepted.booking._id).orFail();
  const payment = await Payment.findById(booking.paymentId)
    .select("+walletId +reservationId").orFail();
  const reservation = await BookingFundReservation.findOne({
    bookingId: booking._id,
  }).select(
    "+walletId +captureKey +captureTransactionId +captureLedgerEntryIds " +
    "+captureProjectionOperationId +captureProjectionOperationReference " +
    "+captureFingerprint +capturedById",
  ).orFail();
  return {
    ...accepted,
    booking,
    payment,
    reservation,
    completion,
    allocationFixtureSequence,
  };
};
