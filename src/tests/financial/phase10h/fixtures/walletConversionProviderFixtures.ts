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
import { InternalWithdrawalProviderRequest } from
  "../../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { InternalTopUpFunding } from
  "../../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Payment } from "../../../../models/payment.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../../models/walletTopUpRequest.model";
import { WalletConversionProviderExecutionService,
  WalletConversionProviderExecutionStage } from
  "../../../../services/financial/walletConversionProviderExecution.service";
import { providerSimulatorService } from
  "../../../../services/providerSimulator/providerSimulator.service";
import { approve, authToken, createDecisionFixture, startDecisionServer } from
  "../../phase10g/fixtures/walletConversionDecisionFixtures";

export const PROVIDER_NOW = new Date("2026-08-02T13:30:00.000Z");

export const captureFrozenFinancialState = async () => ({
  counts: await Promise.all([
    Wallet.countDocuments({}), LedgerEntry.countDocuments({}),
    WalletProjectionOperation.countDocuments({}), Booking.countDocuments({}),
    Payment.countDocuments({}), BookingFundReservation.countDocuments({}),
    BookingEscrowAllocation.countDocuments({}),
    BookingCreatorSettlement.countDocuments({}),
    CreatorWithdrawalRequest.countDocuments({}),
    InternalWithdrawalProviderRequest.countDocuments({}),
    WalletTopUpRequest.countDocuments({}), InternalTopUpFunding.countDocuments({}),
  ]),
  wallets: await Wallet.find({}).sort({ _id: 1 }).lean(),
  snapshots: await ExchangeRateSnapshot.find({}).sort({ _id: 1 })
    .select("+snapshotFingerprint +responseFingerprint").lean(),
});

export const createProviderFixture = async (options?: {
  failureInjector?: (stage: WalletConversionProviderExecutionStage) =>
    void | Promise<void>;
  createTargetWallet?: boolean;
}) => {
  const decision = await createDecisionFixture({
    createTargetWallet: options?.createTargetWallet,
  });
  await approve(decision);
  let tick = 0;
  let executions = 0;
  const service = new WalletConversionProviderExecutionService(
    decision.requestService, {
      now: () => new Date(PROVIDER_NOW.getTime() + tick++),
      failureInjector: options?.failureInjector,
      executor: (input) => {
        executions += 1;
        return providerSimulatorService.simulateWalletConversionProvider(input);
      },
    },
  );
  return { ...decision, service, get executions() { return executions; } };
};

export const executeSuccess = (fixture: Awaited<ReturnType<
  typeof createProviderFixture>>) => fixture.service.execute({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    outcome: "SUCCESS",
  });

export const executeFailure = (fixture: Awaited<ReturnType<
  typeof createProviderFixture>>) => fixture.service.execute({
    adminUserId: fixture.actors.adminId.toString(),
    conversionReference: fixture.created.conversionReference,
    outcome: "FAILURE", failureCode: "SIMULATED_CONVERSION_FAILURE",
    failureReason: "Deterministic conversion provider failure",
  });

export { authToken, startDecisionServer };
