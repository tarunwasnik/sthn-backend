import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";

import { FxRateConfiguration, FxRateProviderMode } from
  "../../../../constants/financial/fxRate.constants";
import { SupportedCurrency } from
  "../../../../constants/financial/supportedCurrencies";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import adminFinancialRoutes from
  "../../../../routes/v1/admin.financial.routes";
import walletRoutes from "../../../../routes/v1/wallet.routes";
import { FxRateSnapshotService } from
  "../../../../services/financial/fxRateSnapshot.service";
import { createActors } from "../../phase7h/fixtures/topUpFixtures";
import { DeterministicFxRateProvider } from
  "../helpers/deterministicFxRateProvider";

export const FIXED_NOW = new Date("2026-08-02T12:00:00.000Z");
export const fixedClock = () => new Date(FIXED_NOW);

export const fxConfig: FxRateConfiguration = {
  providerMode: FxRateProviderMode.REFERENCE,
  providerName: "DETERMINISTIC_FX",
  baseUrl: "https://unused.test/fx",
  timeoutMs: 1_000,
  maxAgeMs: 72 * 60 * 60 * 1000,
  snapshotValidityMs: 24 * 60 * 60 * 1000,
  requestEnabled: true,
};

export const createFxFixture = async (options?: {
  failureInjector?: (point: any) => void | Promise<void>;
}) => {
  const actors = await createActors();
  const provider = new DeterministicFxRateProvider(fixedClock);
  provider.setRate("INR", "USD", {
    rate: "0.011500",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "DAILY-INR-USD-20260802-V1",
    providerPublishedAt: new Date("2026-08-02T06:00:00.000Z"),
  });
  provider.setRate("USD", "INR", {
    rate: "86.956522",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "DAILY-USD-INR-20260802-V1",
  });
  provider.setRate("INR", "EUR", {
    rate: "0.009800",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "DAILY-INR-EUR-20260802-V1",
  });
  provider.setRate("INR", "JPY", {
    rate: "1.720000",
    effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
    providerReference: "DAILY-INR-JPY-20260802-V1",
  });
  const service = new FxRateSnapshotService(provider, {
    config: fxConfig,
    now: fixedClock,
    failureInjector: options?.failureInjector,
  });
  return { actors, provider, service };
};

export const adminActor = (actors: Awaited<ReturnType<typeof createActors>>) => ({
  type: "ADMIN" as const,
  id: actors.adminId,
});

export const systemActor = { type: "SYSTEM" as const };

export const setRate = (
  provider: DeterministicFxRateProvider,
  baseCurrency: SupportedCurrency,
  quoteCurrency: SupportedCurrency,
  rate: string,
  effectiveDate: string,
  version: string,
) => provider.setRate(baseCurrency, quoteCurrency, {
  rate,
  effectiveDate: new Date(effectiveDate),
  providerReference: `DAILY-${baseCurrency}-${quoteCurrency}-${version}`,
});

export const token = (id: { toString(): string }) =>
  jwt.sign({ id: id.toString(), role: "user" }, process.env.JWT_SECRET!);

export const startFxServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/financial", adminFinancialRoutes);
  app.use("/api/v1/wallet", walletRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("FX test server failed.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};
