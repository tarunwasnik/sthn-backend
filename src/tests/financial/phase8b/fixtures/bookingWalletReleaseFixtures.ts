import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";

import bookingRoutes from "../../../../routes/v1/booking.routes";
import creatorDecisionRoutes from "../../../../routes/v1/creatorBookingDecision.routes";
import creatorCancelRoutes from "../../../../routes/v1/creatorCancelBooking.routes";
import adminRoutes from "../../../../routes/v1/admin.routes";
import { notFound } from "../../../../middlewares/notFound";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { Booking } from "../../../../models/booking.model";
import {
  BookingWalletFixture,
  createBookingWalletFixture,
  postWalletBooking,
} from "../../phase8a/fixtures/bookingWalletFixtures";
import { Phase7HActors } from "../../phase7h/fixtures/topUpFixtures";

let releaseSequence = 0;

export const startReleaseHttpServer = async () => {
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
  if (!address || typeof address === "string") throw new Error("Release test server did not bind.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};

export const createActiveWalletBooking = async (
  baseUrl: string,
  options: {
    walletAmount?: number;
    slotAmounts?: number[];
    actors?: Phase7HActors;
  } = {},
) => {
  releaseSequence += 1;
  const fixture = await createBookingWalletFixture(options);
  const response = await postWalletBooking(
    baseUrl,
    fixture,
    `phase8b-reservation-${releaseSequence}`,
  );
  if (response.status !== 201) {
    throw new Error(`Wallet reservation fixture failed: ${JSON.stringify(response)}`);
  }
  const booking = await Booking.findOne({
    bookingReference: response.body.booking.bookingReference,
  }).orFail();
  const creatorToken = jwt.sign(
    { id: fixture.actors.creatorId.toString(), role: "creator" },
    process.env.JWT_SECRET!,
  );
  const adminToken = jwt.sign(
    { id: fixture.actors.adminId.toString(), role: "admin" },
    process.env.JWT_SECRET!,
  );
  return { fixture, booking, response, creatorToken, adminToken };
};

const request = async (
  url: string,
  token: string,
  body: Record<string, unknown>,
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

export const postCreatorDecision = (
  baseUrl: string,
  bookingId: string,
  creatorToken: string,
  decision: "ACCEPT" | "REJECT",
) => request(
  `${baseUrl}/api/v1/creator/bookings/${bookingId}/decision`,
  creatorToken,
  { decision },
);

export const postUserCancellation = (
  baseUrl: string,
  bookingId: string,
  fixture: BookingWalletFixture,
) => request(
  `${baseUrl}/api/v1/bookings/${bookingId}/cancel`,
  fixture.token,
  { reason: "Phase 8B User cancellation", actorId: fixture.actors.creatorId.toString() },
);

export const postCreatorCancellation = (
  baseUrl: string,
  bookingId: string,
  creatorToken: string,
) => request(
  `${baseUrl}/api/v1/bookings/creator/cancel-booking`,
  creatorToken,
  { bookingId, reason: "Phase 8B Creator cancellation", actorId: "spoofed" },
);

export const postAdminCancellation = (
  baseUrl: string,
  bookingId: string,
  adminToken: string,
) => request(
  `${baseUrl}/api/v1/admin/bookings/${bookingId}/cancel`,
  adminToken,
  { reason: "Phase 8B Admin cancellation", actorId: "spoofed" },
  "PATCH",
);
