import { Types } from "mongoose";
import User from "../../../../models/User";
import { UserProfile } from "../../../../models/userProfile.model";
import { Wallet, WalletDocument } from "../../../../models/wallet.model";
import { WalletTopUpRequest, IWalletTopUpRequest } from "../../../../models/walletTopUpRequest.model";
import { IInternalTopUpFunding } from "../../../../models/internalTopUpFunding.model";
import { walletTopUpRequestService } from "../../../../services/financial/walletTopUpRequest.service";
import { adminWalletTopUpDecisionService } from "../../../../services/financial/adminWalletTopUpDecision.service";
import { topUpFundingOrchestratorService } from "../../../../services/financial/topUpFundingOrchestrator.service";
import { topUpAccountingOrchestratorService } from "../../../../services/financial/topUpAccountingOrchestrator.service";
import { ledgerService } from "../../../../services/financial/ledger.service";
import { walletProjectionService } from "../../../../services/wallet/walletProjection.service";
import { walletProjectionOperationRepository } from "../../../../repositories/wallet/walletProjectionOperation.repository";
import { internalTopUpFundingRepository } from "../../../../repositories/internalTopUpFunding.repository";
import { WalletTopUpDecision } from "../../../../enums/financial/walletTopUpDecision.enum";
import { InternalTopUpFundingOutcome } from "../../../../enums/financial/internalTopUpFundingOutcome.enum";
import { InternalTopUpFundingFailureCode } from "../../../../enums/financial/internalTopUpFundingFailureCode.enum";
import { LedgerEntryType } from "../../../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../../../enums/financial/ledgerSource.enum";
import { LedgerAccount } from "../../../../enums/financial/ledgerAccount.enum";
import { deriveTopUpOperationalAccountingIdentity } from "../../../../utils/financial/topUpOperationalIdentity.util";

let fixtureSequence = 0;

export interface Phase7HActors {
  userId: Types.ObjectId;
  adminId: Types.ObjectId;
  creatorId: Types.ObjectId;
  wallet: WalletDocument;
}

export const createActors = async (): Promise<Phase7HActors> => {
  fixtureSequence += 1;
  const suffix = fixtureSequence.toString().padStart(4, "0");
  const [user, admin, creator] = await User.create([
    { email: `phase7h-user-${suffix}@test.local`, role: "user", status: "active" },
    { email: `phase7h-admin-${suffix}@test.local`, role: "admin", status: "active" },
    { email: `phase7h-creator-${suffix}@test.local`, role: "creator", status: "active" },
  ]);
  await UserProfile.create({
    userId: user._id,
    username: `phase7h_user_${suffix}`,
    dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    interests: ["finance"],
    bio: "Phase 7H verified test user",
    avatar: "https://test.local/avatar",
    cover: "https://test.local/cover",
    profilePhotos: ["https://test.local/1", "https://test.local/2"],
    profileStatus: "verified",
  });
  const wallet = await Wallet.create({ userId: user._id, currency: "INR" });
  return {
    userId: user._id as Types.ObjectId,
    adminId: admin._id as Types.ObjectId,
    creatorId: creator._id as Types.ObjectId,
    wallet,
  };
};

export const createFundedTopUp = async (
  actors: Phase7HActors,
  amount: number,
  outcome: InternalTopUpFundingOutcome = InternalTopUpFundingOutcome.SUCCESS,
) => {
  fixtureSequence += 1;
  const requestDto = await walletTopUpRequestService.create(actors.userId.toString(), {
    amount,
    currency: "INR",
    idempotencyKey: `phase7h-top-up-${fixtureSequence}`,
  });
  await adminWalletTopUpDecisionService.decide({
    adminUserId: actors.adminId.toString(),
    topUpReference: requestDto.topUpReference,
    decision: WalletTopUpDecision.APPROVE,
  });
  await topUpFundingOrchestratorService.start({
    topUpReference: requestDto.topUpReference,
    outcome,
    ...(outcome === InternalTopUpFundingOutcome.FAILURE ? {
      failureCode: InternalTopUpFundingFailureCode.SIMULATED_DECLINE,
      failureReason: "Bounded Phase 7H provider failure",
    } : {}),
  });
  const request = await WalletTopUpRequest.findOne({
    topUpReference: requestDto.topUpReference,
  }).select("+providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy");
  if (!request) throw new Error("Top-up fixture request was not persisted.");
  const funding = await internalTopUpFundingRepository.findByTopUpRequestId(
    request._id as Types.ObjectId,
  );
  if (!funding) throw new Error("Top-up fixture funding was not persisted.");
  return { request, funding };
};

export const completeFundedTopUp = async (topUpReference: string) =>
  topUpAccountingOrchestratorService.complete(topUpReference);

export const reloadRequest = async (topUpReference: string): Promise<IWalletTopUpRequest> => {
  const request = await WalletTopUpRequest.findOne({ topUpReference })
    .select("+providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy");
  if (!request) throw new Error("Top-up request was not found.");
  return request;
};

export const establishLedgerStage = async (
  request: IWalletTopUpRequest,
  funding: IInternalTopUpFunding,
) => {
  const identity = deriveTopUpOperationalAccountingIdentity(request, funding);
  const ledger = await ledgerService.createCredit({
    type: LedgerEntryType.WALLET_TOP_UP,
    source: LedgerSource.INTERNAL_TOP_UP_FUNDING,
    account: LedgerAccount.CASH,
    money: { amount: request.amount, currency: request.currency },
    transactionId: identity.transactionId,
    userId: request.userId.toString(),
    idempotencyKey: identity.transactionId,
    postingKey: identity.postingKey,
    description: "Wallet top-up credit",
    metadata: {
      topUpReference: request.topUpReference,
      providerFundingReference: funding.fundingReference,
    },
  });
  return { ledger, identity };
};

export const establishProjectionStage = async (
  request: IWalletTopUpRequest,
  funding: IInternalTopUpFunding,
) => {
  const { ledger, identity } = await establishLedgerStage(request, funding);
  await walletProjectionService.applyProjectionMutation({
    userId: request.userId,
    currency: request.currency,
    operationKey: identity.operationKey,
    deltas: { availableBalance: request.amount },
    ledgerEntryIds: [ledger._id as Types.ObjectId],
  });
  const operation = await walletProjectionOperationRepository.findByOperationKey(identity.operationKey);
  if (!operation) throw new Error("Projection fixture operation was not persisted.");
  return { ledger, operation, identity };
};
