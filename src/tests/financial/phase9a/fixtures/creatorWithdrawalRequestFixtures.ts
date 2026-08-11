import http from "node:http";
import express from "express";

import adminRoutes from "../../../../routes/v1/admin.routes";
import bookingRoutes from "../../../../routes/v1/booking.routes";
import creatorCancelRoutes from "../../../../routes/v1/creatorCancelBooking.routes";
import creatorDecisionRoutes from "../../../../routes/v1/creatorBookingDecision.routes";
import withdrawalRoutes from "../../../../routes/v1/withdrawal.routes";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import { PayoutDestinationType } from "../../../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../../../enums/financial/payoutDestinationVerificationStatus.enum";
import { PayoutDestination } from "../../../../models/payoutDestination.model";
import { generateFinancialReference } from "../../../../utils/financial/reference.util";
import { createSettledOperationalFixture } from "../../phase8f/fixtures/bookingCreatorSettlementOperationalFixtures";

let phase9aSequence = 0;

export const startCreatorWithdrawalHttpServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/bookings", bookingRoutes);
  app.use("/api/v1/bookings/creator", creatorCancelRoutes);
  app.use("/api/v1/creator", creatorDecisionRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/withdrawals", withdrawalRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Phase 9A test server did not bind.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};

export const createEligibleCreatorWithdrawalFixture = async (
  baseUrl: string,
) => {
  phase9aSequence += 1;
  const settled = await createSettledOperationalFixture(baseUrl);
  const destination = await PayoutDestination.create({
    destinationReference: generateFinancialReference("PAYOUT_DESTINATION"),
    creatorId: settled.fixture.actors.creatorId,
    type: PayoutDestinationType.BANK_ACCOUNT,
    verificationStatus: PayoutDestinationVerificationStatus.VERIFIED,
    isActive: true,
    idempotencyKey: `phase9a-destination-${phase9aSequence}`,
    destinationFingerprint: `phase9a-destination-fingerprint-${phase9aSequence}`,
    requestFingerprint: `phase9a-request-fingerprint-${phase9aSequence}`,
    encryptedPayload: {
      version: 1,
      ciphertext: "phase9a-fixture",
      iv: "phase9a-fixture",
      authTag: "phase9a-fixture",
    },
    maskedIdentifier: "••••1234",
    accountNumberLast4: "1234",
    ifscDisplay: "TEST0123456",
    verifiedAt: new Date(),
  });
  return {
    ...settled,
    destination,
    input: {
      authenticatedUserId: settled.fixture.actors.creatorId.toString(),
      amount: { amount: 300, currency: "INR" as const },
      destinationReference: destination.destinationReference,
      idempotencyKey: `phase9a-withdrawal-${phase9aSequence}`,
    },
  };
};

export const postCreatorWithdrawal = async (
  baseUrl: string,
  creatorToken: string | undefined,
  body: Record<string, unknown>,
) => {
  const response = await fetch(`${baseUrl}/api/v1/withdrawals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(creatorToken
        ? { authorization: `Bearer ${creatorToken}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as Record<string, unknown>,
  };
};
