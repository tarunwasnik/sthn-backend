import { Types } from "mongoose";
import jwt from "jsonwebtoken";

import { WithdrawalProviderExecutionOutcome } from
  "../../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../../models/auditLog.model";
import { Booking } from "../../../../models/booking.model";
import { BookingCreatorSettlement } from
  "../../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from
  "../../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from
  "../../../../models/bookingFundReservation.model";
import { CreatorWithdrawalReconciliation } from
  "../../../../models/creatorWithdrawalReconciliation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRequest } from
  "../../../../models/creatorWithdrawalRequest.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../../models/creatorWithdrawalRetryAttempt.model";
import { InternalTopUpFunding } from
  "../../../../models/internalTopUpFunding.model";
import InternalProviderEventModel from
  "../../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Payment } from "../../../../models/payment.model";
import { PayoutDestination } from "../../../../models/payoutDestination.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../../models/walletTopUpRequest.model";
import { bookingCreatorSettlementService } from
  "../../../../services/financial/bookingCreatorSettlement.service";
import { bookingEscrowAllocationService } from
  "../../../../services/financial/bookingEscrowAllocation.service";
import { creatorWithdrawalFinalizationService } from
  "../../../../services/financial/creatorWithdrawalFinalization.service";
import { creatorWithdrawalReconciliationService } from
  "../../../../services/financial/creatorWithdrawalReconciliation.service";
import { creatorWithdrawalRequestService } from
  "../../../../services/financial/creatorWithdrawalRequest.service";
import { withdrawalProviderExecutionService } from
  "../../../../services/financial/withdrawalProviderExecution.service";
import { withdrawalProviderInitializationService } from
  "../../../../services/financial/withdrawalProviderInitialization.service";
import { generateFinancialReference } from
  "../../../../utils/financial/reference.util";
import {
  createActors,
  createFundedTopUp,
  completeFundedTopUp,
} from "../../phase7h/fixtures/topUpFixtures";
import {
  createBookingWalletFixture,
  postWalletBooking,
} from "../../phase8a/fixtures/bookingWalletFixtures";
import { postCreatorDecision } from
  "../../phase8b/fixtures/bookingWalletReleaseFixtures";
import {
  enableBookingCompletion,
  postCreatorCompletion,
} from "../../phase8c/fixtures/bookingWalletCaptureFixtures";
import { startCreatorWithdrawalHttpServer } from
  "../../phase9e/fixtures/creatorWithdrawalOperationalFixtures";

let sequence = 0;

const walletState = async (walletId: Types.ObjectId) => {
  const wallet = await Wallet.findById(walletId).orFail();
  return {
    available: wallet.availableBalance,
    reserved: wallet.reservedBalance,
    locked: wallet.lockedBalance,
    total: wallet.currentBalance,
    version: wallet.projectionVersion,
  };
};

export const snapshotMarketplaceCounts = async () => ({
  topUps: await WalletTopUpRequest.countDocuments(),
  fundings: await InternalTopUpFunding.countDocuments(),
  bookings: await Booking.countDocuments(),
  payments: await Payment.countDocuments(),
  reservations: await BookingFundReservation.countDocuments(),
  allocations: await BookingEscrowAllocation.countDocuments(),
  settlements: await BookingCreatorSettlement.countDocuments(),
  withdrawals: await CreatorWithdrawalRequest.countDocuments(),
  providers: await InternalWithdrawalProviderRequest.countDocuments(),
  providerEvents: await InternalProviderEventModel.countDocuments(),
  reconciliations: await CreatorWithdrawalReconciliation.countDocuments(),
  retries: await CreatorWithdrawalRetryAttempt.countDocuments(),
  repairs: await CreatorWithdrawalRepairOperation.countDocuments(),
  ledger: await LedgerEntry.countDocuments(),
  projections: await WalletProjectionOperation.countDocuments(),
  audits: await AuditLog.countDocuments(),
});

export const createSuccessfulMarketplaceFlow = async (
  options: { customerTopUpAmount?: number } = {},
) => {
  sequence += 1;
  const server = await startCreatorWithdrawalHttpServer();
  try {
    const actors = await createActors();
    const creatorWallet = await Wallet.create({
      userId: actors.creatorId,
      currency: "INR",
      currentBalance: 0,
      availableBalance: 0,
      reservedBalance: 0,
      lockedBalance: 0,
    });
    const walletTimeline: Record<string, unknown> = {
      customerBeforeTopUp: await walletState(actors.wallet._id as Types.ObjectId),
      creatorBeforeSettlement: await walletState(
        creatorWallet._id as Types.ObjectId,
      ),
    };

    const topUp = await createFundedTopUp(
      actors,
      options.customerTopUpAmount ?? 2_000,
    );
    const topUpAccounting = await completeFundedTopUp(
      topUp.request.topUpReference,
    );
    walletTimeline.customerAfterTopUp = await walletState(
      actors.wallet._id as Types.ObjectId,
    );

    const bookingFixture = await createBookingWalletFixture({
      actors,
      walletAmount: 0,
      slotAmounts: [1_000],
    });
    const bookingIdempotencyKey = `phase10a-booking-${sequence}`;
    const requested = await postWalletBooking(
      server.baseUrl,
      bookingFixture,
      bookingIdempotencyKey,
    );
    if (requested.status !== 201) throw new Error(
      `Phase 10A booking request failed: ${JSON.stringify(requested.body)}`,
    );
    let booking = await Booking.findOne({
      bookingReference: requested.body.booking.bookingReference,
    }).orFail();
    let payment = await Payment.findById(booking.paymentId)
      .select("+walletId +reservationId").orFail();
    let reservation = await BookingFundReservation.findOne({
      bookingId: booking._id,
    }).orFail();
    const lifecycle = {
      booking: [booking.status],
      payment: [payment.status],
      reservation: [reservation.status],
      provider: ["CREATED"],
      withdrawal: ["PENDING"],
    };
    walletTimeline.customerAfterReservation = await walletState(
      actors.wallet._id as Types.ObjectId,
    );

    const creatorToken = jwt.sign(
      { id: actors.creatorId.toString(), role: "creator" },
      process.env.JWT_SECRET!,
    );
    const accepted = await postCreatorDecision(
      server.baseUrl,
      booking._id.toString(),
      creatorToken,
      "ACCEPT",
    );
    if (accepted.status !== 200) throw new Error(
      `Phase 10A Creator acceptance failed: ${JSON.stringify(accepted.body)}`,
    );
    booking = await Booking.findById(booking._id).orFail();
    lifecycle.booking.push(booking.status);

    await enableBookingCompletion(actors.adminId.toString());
    const completed = await postCreatorCompletion(
      server.baseUrl,
      booking._id.toString(),
      creatorToken,
    );
    if (completed.status !== 200) throw new Error(
      `Phase 10A Booking completion failed: ${JSON.stringify(completed.body)}`,
    );
    booking = await Booking.findById(booking._id).orFail();
    payment = await Payment.findById(payment._id)
      .select("+walletId +reservationId").orFail();
    reservation = await BookingFundReservation.findById(reservation._id).orFail();
    lifecycle.booking.push(booking.status);
    lifecycle.payment.push(payment.status);
    lifecycle.reservation.push(reservation.status);
    walletTimeline.customerAfterCapture = await walletState(
      actors.wallet._id as Types.ObjectId,
    );

    const allocationResult = await bookingEscrowAllocationService.allocate(
      booking._id.toString(),
    );
    const allocation = await BookingEscrowAllocation.findOne({
      bookingId: booking._id,
    }).orFail();
    const settlementResult = await bookingCreatorSettlementService.settle(
      booking._id.toString(),
    );
    const settlement = await BookingCreatorSettlement.findOne({
      bookingId: booking._id,
    }).orFail();
    walletTimeline.creatorAfterSettlement = await walletState(
      creatorWallet._id as Types.ObjectId,
    );

    const destination = await PayoutDestination.create({
      destinationReference: generateFinancialReference("PAYOUT_DESTINATION"),
      creatorId: actors.creatorId,
      type: "BANK_ACCOUNT",
      verificationStatus: "VERIFIED",
      isActive: true,
      idempotencyKey: `phase10a-destination-${sequence}`,
      destinationFingerprint: `phase10a-destination-fingerprint-${sequence}`,
      requestFingerprint: `phase10a-destination-request-${sequence}`,
      encryptedPayload: { version: 1, ciphertext: "phase10a-fixture",
        iv: "phase10a-fixture", authTag: "phase10a-fixture" },
      maskedIdentifier: "••••8000",
      accountNumberLast4: "8000",
      ifscDisplay: "TEST0123456",
      verifiedAt: new Date(),
    });
    const withdrawalInput = {
      authenticatedUserId: actors.creatorId.toString(),
      amount: { amount: 800, currency: "INR" as const },
      destinationReference: destination.destinationReference,
      idempotencyKey: `phase10a-withdrawal-${sequence}`,
    };
    const withdrawalRequested = await creatorWithdrawalRequestService.request(
      withdrawalInput,
    );
    lifecycle.withdrawal.push(withdrawalRequested.status);
    walletTimeline.creatorAfterWithdrawalReservation = await walletState(
      creatorWallet._id as Types.ObjectId,
    );
    const providerInitialized = await withdrawalProviderInitializationService
      .initialize(withdrawalRequested.withdrawalReference);
    lifecycle.provider.push(providerInitialized.providerStatus);
    const providerExecuted = await withdrawalProviderExecutionService.execute({
      withdrawalReference: withdrawalRequested.withdrawalReference,
      outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
    });
    lifecycle.provider.push("PROCESSING", providerExecuted.providerStatus);
    const withdrawalFinalized = await creatorWithdrawalFinalizationService
      .finalize(withdrawalRequested.withdrawalReference);
    lifecycle.withdrawal.push(withdrawalFinalized.status);
    walletTimeline.creatorAfterWithdrawal = await walletState(
      creatorWallet._id as Types.ObjectId,
    );
    const reconciliation = await creatorWithdrawalReconciliationService.inspect(
      withdrawalRequested.withdrawalReference,
      actors.adminId.toString(),
    );

    return {
      server,
      actors,
      creatorWallet,
      topUp,
      topUpAccounting,
      bookingFixture,
      bookingIdempotencyKey,
      creatorToken,
      booking,
      payment,
      reservation,
      allocation,
      allocationResult,
      settlement,
      settlementResult,
      destination,
      withdrawalInput,
      withdrawalReference: withdrawalRequested.withdrawalReference,
      providerInitialized,
      providerExecuted,
      withdrawalFinalized,
      reconciliation,
      lifecycle,
      walletTimeline,
    };
  } catch (error) {
    await server.close();
    throw error;
  }
};

export type SuccessfulMarketplaceFlow = Awaited<
  ReturnType<typeof createSuccessfulMarketplaceFlow>
>;

export const replaySuccessfulMarketplaceFlow = async (
  flow: SuccessfulMarketplaceFlow,
) => {
  const topUp = await completeFundedTopUp(flow.topUp.request.topUpReference);
  const capture = await postCreatorCompletion(
    flow.server.baseUrl,
    flow.booking._id.toString(),
    flow.creatorToken,
  );
  if (capture.status !== 200) throw new Error(
    `Phase 10A capture replay failed: ${JSON.stringify(capture.body)}`,
  );
  const allocation = await bookingEscrowAllocationService.allocate(
    flow.booking._id.toString(),
  );
  const settlement = await bookingCreatorSettlementService.settle(
    flow.booking._id.toString(),
  );
  const withdrawal = await creatorWithdrawalRequestService.request(
    flow.withdrawalInput,
  );
  const initialized = await withdrawalProviderInitializationService.initialize(
    flow.withdrawalReference,
  );
  const executed = await withdrawalProviderExecutionService.execute({
    withdrawalReference: flow.withdrawalReference,
    outcome: WithdrawalProviderExecutionOutcome.SUCCESS,
  });
  const finalized = await creatorWithdrawalFinalizationService.finalize(
    flow.withdrawalReference,
  );
  const reconciliation = await creatorWithdrawalReconciliationService.inspect(
    flow.withdrawalReference,
    flow.actors.adminId.toString(),
  );
  return { topUp, capture, allocation, settlement, withdrawal, initialized,
    executed, finalized, reconciliation };
};
