import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import { Wallet } from "../../../../models/wallet.model";
import walletRoutes from "../../../../routes/v1/wallet.routes";
import { FxRateSnapshotService } from
  "../../../../services/financial/fxRateSnapshot.service";
import { WalletConversionRequestService,
  WalletConversionFailurePoint } from
  "../../../../services/financial/walletConversionRequest.service";
import { createActors } from "../../phase7h/fixtures/topUpFixtures";
import { DeterministicFxRateProvider } from
  "../../phase10e/helpers/deterministicFxRateProvider";
import { FIXED_NOW, fixedClock, fxConfig, systemActor } from
  "../../phase10e/fixtures/fxRateSnapshotFixtures";

export const fundWallet = async (userId: Types.ObjectId, currency: any,
  amount = 1_000_000) => Wallet.create({ userId, currency,
    currentBalance: amount, availableBalance: amount });

export const createConversionFixture = async (options?: {
  failureInjector?: (point: WalletConversionFailurePoint) => void | Promise<void>;
  createUsdWallet?: boolean;
}) => {
  const actors = await createActors();
  await Wallet.findByIdAndUpdate(actors.wallet._id, { $set: {
    currentBalance: 2_000_000, availableBalance: 2_000_000,
  } }, { runValidators: true });
  actors.wallet = (await Wallet.findById(actors.wallet._id))!;
  if (options?.createUsdWallet) await fundWallet(actors.userId, "USD", 500_000);
  const provider = new DeterministicFxRateProvider(fixedClock);
  provider.setRate("INR", "USD", { rate: "0.011500",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "PHASE10F-INR-USD-V1" });
  provider.setRate("INR", "EUR", { rate: "0.009800",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "PHASE10F-INR-EUR-V1" });
  provider.setRate("INR", "JPY", { rate: "1.720000",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "PHASE10F-INR-JPY-V1" });
  provider.setRate("USD", "JPY", { rate: "150.250000",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "PHASE10F-USD-JPY-V1" });
  provider.setRate("JPY", "USD", { rate: "0.006656",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "PHASE10F-JPY-USD-V1" });
  const fxService = new FxRateSnapshotService(provider, {
    config: fxConfig, now: fixedClock,
  });
  await Promise.all([
    fxService.lookupOrRefresh("INR", "USD", systemActor),
    fxService.lookupOrRefresh("INR", "EUR", systemActor),
    fxService.lookupOrRefresh("INR", "JPY", systemActor),
    fxService.lookupOrRefresh("USD", "JPY", systemActor),
    fxService.lookupOrRefresh("JPY", "USD", systemActor),
  ]);
  const service = new WalletConversionRequestService(fxService, undefined, {
    now: () => new Date(FIXED_NOW),
    failureInjector: options?.failureInjector,
  });
  return { actors, provider, fxService, service };
};

export const requestInput = (key = "phase10f-inr-usd") => ({
  sourceCurrency: "INR", targetCurrency: "USD", sourceAmount: 870_000,
  idempotencyKey: key,
});

export const authToken = (id: Types.ObjectId) => jwt.sign({
  id: id.toString(), role: "user",
}, process.env.JWT_SECRET!);

export const startConversionServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/wallet", walletRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed.");
  return { baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())) };
};
