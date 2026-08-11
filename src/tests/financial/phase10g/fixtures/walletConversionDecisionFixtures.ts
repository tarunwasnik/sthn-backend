import http from "node:http";
import express from "express";
import { Types } from "mongoose";

import { Booking } from "../../../../models/booking.model";
import { BookingCreatorSettlement } from
  "../../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from
  "../../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from
  "../../../../models/bookingFundReservation.model";
import { CreatorWithdrawalRequest } from
  "../../../../models/creatorWithdrawalRequest.model";
import { ExchangeRateSnapshot } from
  "../../../../models/exchangeRateSnapshot.model";
import InternalProviderEvent from
  "../../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { InternalTopUpFunding } from
  "../../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Payment } from "../../../../models/payment.model";
import { Wallet } from "../../../../models/wallet.model";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import { WalletConversionRequest } from
  "../../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../../models/walletTopUpRequest.model";
import adminFinancialRoutes from
  "../../../../routes/v1/admin.financial.routes";
import walletRoutes from "../../../../routes/v1/wallet.routes";
import { AdminWalletConversionDecisionService,
  WalletConversionDecisionFailurePoint } from
  "../../../../services/financial/adminWalletConversionDecision.service";
import { FxRateSnapshotService } from
  "../../../../services/financial/fxRateSnapshot.service";
import { WalletConversionRequestService } from
  "../../../../services/financial/walletConversionRequest.service";
import { FIXED_NOW, fxConfig } from
  "../../phase10e/fixtures/fxRateSnapshotFixtures";
import { authToken, createConversionFixture, fundWallet, requestInput } from
  "../../phase10f/fixtures/walletConversionRequestFixtures";

export const DECISION_NOW = new Date("2026-08-02T13:00:00.000Z");

export const captureNoMoneyState = async () => ({
  counts: await Promise.all([
    Wallet.countDocuments({}), LedgerEntry.countDocuments({}),
    WalletProjectionOperation.countDocuments({}), Booking.countDocuments({}),
    Payment.countDocuments({}), BookingFundReservation.countDocuments({}),
    BookingEscrowAllocation.countDocuments({}),
    BookingCreatorSettlement.countDocuments({}),
    CreatorWithdrawalRequest.countDocuments({}),
    InternalWithdrawalProviderRequest.countDocuments({}),
    InternalProviderEvent.countDocuments({}),
    WalletTopUpRequest.countDocuments({}),
    InternalTopUpFunding.countDocuments({}),
  ]),
  wallets: await Wallet.find({}).sort({ _id: 1 }).lean(),
  snapshots: await ExchangeRateSnapshot.find({})
    .sort({ snapshotReference: 1 })
    .select("+snapshotFingerprint +responseFingerprint").lean(),
});

export const createDecisionFixture = async (options?: {
  createTargetWallet?: boolean;
  decisionNow?: Date;
  failureInjector?: (point: WalletConversionDecisionFailurePoint) =>
    void | Promise<void>;
}) => {
  const conversion = await createConversionFixture();
  if (options?.createTargetWallet) {
    await fundWallet(conversion.actors.userId, "USD", 25_000);
  }
  const created = await conversion.service.create(
    conversion.actors.userId.toString(), requestInput(
      `phase10g-${new Types.ObjectId().toString()}`),
  );
  const request = await WalletConversionRequest.findOne({
    conversionReference: created.conversionReference,
  }).select("+conversionKey +userId +sourceWalletId +targetWalletId +fxSnapshotId " +
    "+rateValue +rateScale +inverseRateValue +inverseRateScale " +
    "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
    "+decidedBy");
  if (!request) throw new Error("Phase 10G request fixture was not persisted.");
  const decisionNow = options?.decisionNow ?? DECISION_NOW;
  const decisionFx = options?.decisionNow
    ? new FxRateSnapshotService(conversion.provider, { config: fxConfig,
      now: () => new Date(decisionNow) })
    : conversion.fxService;
  const requestService = options?.decisionNow
    ? new WalletConversionRequestService(decisionFx)
    : conversion.service;
  const decisionService = new AdminWalletConversionDecisionService(
    requestService, { now: () => new Date(decisionNow),
      failureInjector: options?.failureInjector },
  );
  return { ...conversion, request, created, decisionService, requestService,
    decisionNow };
};

export const approve = (fixture: Awaited<ReturnType<
  typeof createDecisionFixture>>) => fixture.decisionService.decide({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    decision: "APPROVE",
  });

export const reject = (fixture: Awaited<ReturnType<
  typeof createDecisionFixture>>, rejectionCode = "ADMIN_DECLINED",
  rejectionReason: string | undefined = "Admin declined this request") =>
  fixture.decisionService.decide({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    decision: "REJECT", rejectionCode, rejectionReason,
  });

export { authToken };

export const startDecisionServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/financial", adminFinancialRoutes);
  app.use("/api/v1/wallet", walletRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed.");
  return { baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolve())) };
};
