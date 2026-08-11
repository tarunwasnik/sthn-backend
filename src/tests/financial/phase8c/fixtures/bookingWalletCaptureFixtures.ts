import http from "node:http";
import express from "express";

import bookingRoutes from "../../../../routes/v1/booking.routes";
import creatorDecisionRoutes from "../../../../routes/v1/creatorBookingDecision.routes";
import creatorCancelRoutes from "../../../../routes/v1/creatorCancelBooking.routes";
import adminRoutes from "../../../../routes/v1/admin.routes";
import { notFound } from "../../../../middlewares/notFound";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { Booking } from "../../../../models/booking.model";
import { FeatureFlag } from "../../../../models/featureFlag.model";
import { Slot } from "../../../../models/slot.model";
import { featureFlagCache } from "../../../../services/controlPlane/featureFlagCache.service";
import {
  createActiveWalletBooking,
  postCreatorDecision,
  startReleaseHttpServer,
} from "../../phase8b/fixtures/bookingWalletReleaseFixtures";
import { Phase7HActors } from "../../phase7h/fixtures/topUpFixtures";

export { postAdminCancellation, postCreatorCancellation, postUserCancellation }
  from "../../phase8b/fixtures/bookingWalletReleaseFixtures";

let captureSequence = 0;

export const startCaptureHttpServer = startReleaseHttpServer;

export const enableBookingCompletion = async (adminId: string) => {
  await FeatureFlag.updateOne(
    { key: "BOOKING_COMPLETION_ENABLED" },
    {
      $set: { enabled: true, scope: "GLOBAL", createdBy: adminId },
      $setOnInsert: { key: "BOOKING_COMPLETION_ENABLED" },
    },
    { upsert: true },
  );
  featureFlagCache.invalidate();
};

export const createAcceptedWalletBooking = async (
  baseUrl: string,
  options: {
    walletAmount?: number;
    slotAmounts?: number[];
    actors?: Phase7HActors;
  } = {},
) => {
  captureSequence += 1;
  const active = await createActiveWalletBooking(baseUrl, options);
  await enableBookingCompletion(active.fixture.actors.adminId.toString());
  const accepted = await postCreatorDecision(
    baseUrl,
    active.booking._id.toString(),
    active.creatorToken,
    "ACCEPT",
  );
  if (accepted.status !== 200) {
    throw new Error(`Wallet acceptance fixture failed: ${JSON.stringify(accepted)}`);
  }
  return {
    ...active,
    booking: await Booking.findById(active.booking._id).orFail(),
    accepted,
  };
};

export const makeBookingAutoCompletionEligible = async (bookingId: string) => {
  const booking = await Booking.findById(bookingId).orFail();
  const endTime = new Date(Date.now() - 11 * 60 * 1_000);
  await Slot.updateMany(
    { _id: { $in: booking.slotIds } },
    {
      $set: {
        startTime: new Date(endTime.getTime() - 30 * 60 * 1_000),
        endTime,
      },
    },
  );
};

const request = async (
  url: string,
  token: string,
  body: Record<string, unknown> = {},
  method = "POST",
) => {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
};

export const postCreatorCompletion = (
  baseUrl: string,
  bookingId: string,
  creatorToken: string,
) => request(
  `${baseUrl}/api/v1/bookings/${bookingId}/complete/creator`,
  creatorToken,
);

/** Used only by provider regression when a lightweight server is preferable. */
export const startCompletionHttpServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/bookings", bookingRoutes);
  app.use("/api/v1/bookings/creator", creatorCancelRoutes);
  app.use("/api/v1/creator", creatorDecisionRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Capture server did not bind.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};
