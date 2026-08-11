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
import { InternalTopUpFunding } from
  "../../../../models/internalTopUpFunding.model";
import { Payment } from "../../../../models/payment.model";
import { WalletTopUpRequest } from
  "../../../../models/walletTopUpRequest.model";
import { WalletConversionRequest } from
  "../../../../models/walletConversionRequest.model";
import { WalletConversionAccountingService,
  WalletConversionAccountingStage } from
  "../../../../services/financial/walletConversionAccounting.service";
import { createProviderFixture, executeFailure, executeSuccess } from
  "../../phase10h/fixtures/walletConversionProviderFixtures";

export const ACCOUNTING_NOW = new Date("2026-08-03T12:00:00.000Z");

export const createAccountingFixture = async (options?: {
  createTargetWallet?: boolean;
  providerOutcome?: "SUCCESS" | "FAILURE";
  failureInjector?: (stage: WalletConversionAccountingStage) =>
    void | Promise<void>;
}) => {
  const providerFixture = await createProviderFixture({
    createTargetWallet: options?.createTargetWallet,
  });
  if (options?.providerOutcome === "FAILURE") {
    await executeFailure(providerFixture);
  } else {
    await executeSuccess(providerFixture);
  }
  let tick = 0;
  const service = new WalletConversionAccountingService({
    now: () => new Date(ACCOUNTING_NOW.getTime() + tick++),
    failureInjector: options?.failureInjector,
  });
  const request = await WalletConversionRequest.findOne({
    conversionReference: providerFixture.created.conversionReference,
  }).select("+conversionKey +userId +sourceWalletId +targetWalletId " +
    "+fxSnapshotId +rateValue +rateScale +inverseRateValue " +
    "+inverseRateScale +sourceMinorUnits +targetMinorUnits " +
    "+idempotencyKey +requestFingerprint +decidedBy +providerMetadata")
    .orFail();
  return { ...providerFixture, service, request };
};

export const account = (fixture: Awaited<ReturnType<
  typeof createAccountingFixture>>) => fixture.service.account(
    fixture.created.conversionReference);

export const captureUnrelatedFinancialState = async () => ({
  snapshots: await ExchangeRateSnapshot.find({}).sort({ _id: 1 })
    .select("+snapshotFingerprint +responseFingerprint").lean(),
  counts: await Promise.all([
    Booking.countDocuments({}), Payment.countDocuments({}),
    BookingFundReservation.countDocuments({}),
    BookingEscrowAllocation.countDocuments({}),
    BookingCreatorSettlement.countDocuments({}),
    CreatorWithdrawalRequest.countDocuments({}),
    WalletTopUpRequest.countDocuments({}),
    InternalTopUpFunding.countDocuments({}),
  ]),
});

export const uniqueKey = (prefix: string) =>
  `${prefix}-${new Types.ObjectId().toString()}`;
