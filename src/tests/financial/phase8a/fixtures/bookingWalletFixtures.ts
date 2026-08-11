import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import bookingRoutes from "../../../../routes/v1/booking.routes";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import { CreatorProfile } from "../../../../models/creatorProfile.model";
import { CreatorService } from "../../../../models/creatorService.model";
import { Slot } from "../../../../models/slot.model";
import { Wallet } from "../../../../models/wallet.model";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  Phase7HActors,
} from "../../phase7h/fixtures/topUpFixtures";
import { SupportedCurrency } from "../../../../constants/financial/supportedCurrencies";
import { marketplacePricingService } from
  "../../../../services/financial/marketplacePricing.service";
import { creatorServiceMajorToMinor } from
  "../../../../utils/financial/creatorServicePrice.util";
import { currencyMetadataService } from
  "../../../../services/financial/currencyMetadata.service";

let bookingSequence = 0;

// Phase 8A test callers express expected financial amounts in minor units.
// CreatorService and Slot persist the equivalent creator-facing major amount.
const minorToCreatorMajor = (amount: number, currency: SupportedCurrency): number => {
  const minorUnits = currencyMetadataService.get(currency).minorUnits;
  const raw = String(amount).padStart(minorUnits + 1, "0");
  const whole = raw.slice(0, -minorUnits) || "0";
  const fraction = raw.slice(-minorUnits);
  return Number(minorUnits === 0 ? raw : `${whole}.${fraction}`);
};

export interface BookingWalletFixture {
  actors: Phase7HActors;
  serviceId: Types.ObjectId;
  slotIds: Types.ObjectId[];
  token: string;
  amount: number;
  serviceAmount: number;
  platformFeeAmount: number;
  commissionAmount: number;
  creatorAmount: number;
  totalAmount: number;
}

export const fundWallet = async (actors: Phase7HActors, amount: number) => {
  const { request } = await createFundedTopUp(actors, amount);
  await completeFundedTopUp(request.topUpReference);
  return Wallet.findById(actors.wallet._id).orFail();
};

export const createBookingWalletFixture = async (
  options: {
    walletAmount?: number;
    slotAmounts?: number[];
    slotPricesMajor?: number[];
    currency?: string;
    actors?: Phase7HActors;
  } = {},
): Promise<BookingWalletFixture> => {
  bookingSequence += 1;
  const actors = options.actors ?? await createActors();
  const currency = options.currency ?? "INR";
  const supportedCurrency = currency as SupportedCurrency;
  const slotPrices = options.slotPricesMajor ?? (options.slotAmounts ?? [400])
    .map((amount) => minorToCreatorMajor(amount, supportedCurrency));
  if ((options.walletAmount ?? 1_000) > 0) {
    await fundWallet(actors, options.walletAmount ?? 1_000);
  }
  if (!await CreatorProfile.exists({ userId: actors.creatorId })) {
    await CreatorProfile.create({
      userId: actors.creatorId,
      slug: `phase8a-creator-${bookingSequence}`,
      displayName: "Phase 8A Creator",
      primaryCategory: "testing",
      country: "IN",
      city: "Test City",
      currency,
      status: "active",
    });
  }
  const service = await CreatorService.create({
    creatorId: actors.creatorId,
    title: `Phase 8A Service ${bookingSequence}`,
    description: "Wallet reservation runtime fixture",
    durationMinutes: 30,
    price: slotPrices[0],
    currency,
    isActive: true,
  });
  const start = Date.now() + 24 * 60 * 60 * 1000;
  const slots = await Slot.create(slotPrices.map((price, index) => ({
    availabilityId: new Types.ObjectId(),
    creatorId: actors.creatorId,
    serviceId: service._id,
    startTime: new Date(start + index * 30 * 60 * 1000),
    endTime: new Date(start + (index + 1) * 30 * 60 * 1000),
    timezone: "UTC",
    status: "AVAILABLE",
    price,
  })));
  const token = jwt.sign(
    { id: actors.userId.toString(), role: "user" },
    process.env.JWT_SECRET!,
  );
  const amount = slotPrices.reduce((sum, price) => sum +
    creatorServiceMajorToMinor(price, supportedCurrency), 0);
  const pricing = marketplacePricingService.calculate({
    serviceAmount: amount,
    currency: supportedCurrency,
  });
  return {
    actors,
    serviceId: service._id as Types.ObjectId,
    slotIds: slots.map((slot) => slot._id as Types.ObjectId),
    token,
    amount,
    ...pricing,
  };
};

export const startBookingHttpServer = async () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/v1/bookings", bookingRoutes);
  testApp.use(notFound);
  testApp.use(errorHandler);
  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};

export const postWalletBooking = async (
  baseUrl: string,
  fixture: BookingWalletFixture,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {},
) => {
  const response = await fetch(`${baseUrl}/api/v1/bookings/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${fixture.token}`,
    },
    body: JSON.stringify({
      serviceId: fixture.serviceId.toString(),
      slotIds: fixture.slotIds.map(String),
      paymentMethod: "WALLET",
      idempotencyKey,
      ...overrides,
    }),
  });
  return {
    status: response.status,
    body: await response.json() as Record<string, any>,
  };
};
