import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import { SupportedCurrency } from
  "../../../../constants/financial/supportedCurrencies";
import { InternalTopUpFundingOutcome } from
  "../../../../enums/financial/internalTopUpFundingOutcome.enum";
import { WalletTopUpDecision } from
  "../../../../enums/financial/walletTopUpDecision.enum";
import { WalletTopUpRequest } from
  "../../../../models/walletTopUpRequest.model";
import { Wallet } from "../../../../models/wallet.model";
import walletRoutes from "../../../../routes/v1/wallet.routes";
import { adminWalletTopUpDecisionService } from
  "../../../../services/financial/adminWalletTopUpDecision.service";
import { topUpAccountingOrchestratorService } from
  "../../../../services/financial/topUpAccountingOrchestrator.service";
import { topUpFundingOrchestratorService } from
  "../../../../services/financial/topUpFundingOrchestrator.service";
import { walletTopUpRequestService } from
  "../../../../services/financial/walletTopUpRequest.service";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import {
  createActors,
  Phase7HActors,
} from "../../phase7h/fixtures/topUpFixtures";

let sequence = 0;

export interface Phase10DActors extends Phase7HActors {}

export const createMultiCurrencyActors = async (
  initialInrBalance = 0,
): Promise<Phase10DActors> => {
  const actors = await createActors();
  if (initialInrBalance > 0) {
    await Wallet.collection.updateOne(
      { _id: actors.wallet._id },
      { $set: {
        availableBalance: initialInrBalance,
        currentBalance: initialInrBalance,
      } },
    );
  }
  return actors;
};

export const requestTopUp = async (
  actors: Phase10DActors,
  currency: SupportedCurrency,
  amount: number,
  idempotencyKey?: string,
) => {
  sequence += 1;
  return walletTopUpRequestService.create(actors.userId.toString(), {
    currency,
    amount,
    idempotencyKey: idempotencyKey ??
      `phase10d-${currency.toLowerCase()}-${sequence}`,
  });
};

export const approveTopUp = async (
  actors: Phase10DActors,
  topUpReference: string,
) => adminWalletTopUpDecisionService.decide({
  adminUserId: actors.adminId.toString(),
  topUpReference,
  decision: WalletTopUpDecision.APPROVE,
});

export const succeedFunding = async (topUpReference: string) =>
  topUpFundingOrchestratorService.start({
    topUpReference,
    outcome: InternalTopUpFundingOutcome.SUCCESS,
  });

export const completeAccounting = async (topUpReference: string) =>
  topUpAccountingOrchestratorService.complete(topUpReference);

export const completeDirectTopUp = async (
  actors: Phase10DActors,
  currency: SupportedCurrency,
  amount: number,
  idempotencyKey?: string,
) => {
  const request = await requestTopUp(
    actors, currency, amount, idempotencyKey,
  );
  const approved = await approveTopUp(actors, request.topUpReference);
  const funding = await succeedFunding(request.topUpReference);
  const accounting = await completeAccounting(request.topUpReference);
  return { request, approved, funding, accounting };
};

export const reloadTopUp = async (topUpReference: string) => {
  const request = await WalletTopUpRequest.findOne({ topUpReference })
    .select("+requestFingerprint +providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy")
    .exec();
  if (!request) throw new Error("Phase 10D top-up request was not found.");
  return request;
};

export const getWallet = async (
  userId: Types.ObjectId,
  currency: SupportedCurrency,
) => Wallet.findOne({ userId, currency }).orFail();

export const authToken = (userId: Types.ObjectId) => jwt.sign(
  { id: userId.toString(), role: "user" },
  process.env.JWT_SECRET!,
);

export const startWalletServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/wallet", walletRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Phase 10D HTTP server did not bind.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};
